"""YouTube AI search helper for Fidelity Dynamics - Egocentric Video Discovery."""

import os
from google import genai
import scrapetube
import json
from datetime import datetime, timedelta
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Use latest Gemini Flash model (most cost-effective)
MODEL = "gemini-2.0-flash-exp"


def _get_client():
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def _rephrase_query_for_egocentric(query: str) -> str:
    """Use Gemini to rephrase user query optimized for egocentric video search."""
    system_prompt = """You are a query optimization agent for Fidelity Dynamics Scene Builder Platform.

CONTEXT:
Users are searching for egocentric (first-person POV) videos to inject into our scene builder platform for robot training. These videos will be used to create diverse training environments and control systems.

TASK:
Given a user's search query, rephrase it to find the BEST egocentric videos on YouTube that match their intent.

REQUIREMENTS:
1. Prioritize first-person POV perspectives
2. Focus on task-oriented activities with clear hand-object interactions
3. Look for diverse environments and settings
4. Prefer videos with good lighting and task clarity
5. Add search terms like: "POV", "first person", "gopro", "egocentric", "hands", "tutorial", "how to"

OUTPUT:
Return ONLY the optimized search query string, nothing else.

EXAMPLES:
Input: "cooking pasta"
Output: first person POV cooking pasta hands gopro tutorial egocentric view

Input: "fixing a car"
Output: POV car repair first person hands mechanic tutorial egocentric gopro

Input: "making coffee"
Output: first person making coffee POV hands barista tutorial egocentric view

Now rephrase this query:
"""

    try:
        client = _get_client()
        if not client:
            return query  # Skip rephrasing if no API key
        prompt = system_prompt + f'"{query}"'
        response = client.models.generate_content(model=MODEL, contents=prompt)
        rephrased = (response.text or "").strip()
        return rephrased if rephrased else query
    except Exception as e:
        print(f"Query rephrasing failed: {e}, using original query")
        return query


def _extract_results(query: str, max_results: int = 60) -> list[dict]:
    """Extract YouTube search results using scrapetube."""
    videos = scrapetube.get_search(query=query)
    results = []

    for video in videos:
        title_runs = video.get("title", {}).get("runs", [])
        title = title_runs[0].get("text") if title_runs else "Untitled"
        video_id = video.get("videoId", "")
        channel_runs = video.get("ownerText", {}).get("runs", [])
        channel = channel_runs[0].get("text") if channel_runs else "Unknown channel"
        length = video.get("lengthText", {}).get("simpleText", "Unknown length")
        published = video.get("publishedTimeText", {}).get("simpleText", "Unknown date")
        url = f"https://www.youtube.com/watch?v={video_id}" if video_id else "N/A"
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else ""

        results.append(
            {
                "title": title,
                "channel": channel,
                "length": length,
                "published": published,
                "url": url,
                "thumbnail": thumbnail,
                "video_id": video_id,
            }
        )
        if len(results) >= max_results:
            break

    return results


def _extract_results_with_api(
    query: str,
    max_results: int = 60,
    sort_by: str = "relevance",
    published_after: str = None,
    duration: str = "any",
    video_type: str = "any",
    type_filter: str = "video"
) -> list[dict]:
    """
    Extract YouTube search results using YouTube Data API v3 with filters.

    Args:
        query: Search query
        max_results: Maximum number of results to return
        sort_by: Sort order (relevance, date, viewCount, rating)
        published_after: ISO 8601 datetime string for filtering by upload date
        duration: Video duration (any, short, medium, long)
        video_type: Video type (any, episode, movie)
        type_filter: Result type (video, channel, playlist)

    Returns:
        List of video dictionaries with metadata
    """
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        print("WARNING: YOUTUBE_API_KEY not found, falling back to scrapetube")
        return _extract_results(query, max_results)

    try:
        youtube = build('youtube', 'v3', developerKey=api_key)

        # Build search parameters
        search_params = {
            'q': query,
            'part': 'snippet',
            'maxResults': min(max_results, 50),  # API max is 50 per request
            'type': type_filter,
            'order': sort_by
        }

        # Add optional filters
        if published_after:
            search_params['publishedAfter'] = published_after

        if type_filter == 'video':
            if duration and duration != 'any':
                search_params['videoDuration'] = duration
            if video_type and video_type != 'any':
                search_params['videoType'] = video_type

        # Execute search
        search_response = youtube.search().list(**search_params).execute()

        results = []
        video_ids = []

        # Extract basic info from search results
        for item in search_response.get('items', []):
            if item['id']['kind'] == 'youtube#video':
                video_id = item['id']['videoId']
                video_ids.append(video_id)

                snippet = item['snippet']
                results.append({
                    'video_id': video_id,
                    'title': snippet.get('title', 'Untitled'),
                    'channel': snippet.get('channelTitle', 'Unknown channel'),
                    'published': snippet.get('publishedAt', 'Unknown date'),
                    'thumbnail': snippet.get('thumbnails', {}).get('high', {}).get('url', ''),
                    'url': f"https://www.youtube.com/watch?v={video_id}",
                    'length': 'Unknown'  # Will be updated below
                })

        # Get additional video details (duration, view count, etc.)
        if video_ids and type_filter == 'video':
            videos_response = youtube.videos().list(
                part='contentDetails,statistics',
                id=','.join(video_ids)
            ).execute()

            # Create a mapping of video_id to duration
            duration_map = {}
            for video_item in videos_response.get('items', []):
                video_id = video_item['id']
                duration_str = video_item['contentDetails']['duration']
                # Convert ISO 8601 duration to readable format (e.g., "PT1H2M10S" -> "1:02:10")
                duration_map[video_id] = _parse_duration(duration_str)

            # Update results with durations
            for result in results:
                result['length'] = duration_map.get(result['video_id'], 'Unknown')

        return results

    except HttpError as e:
        error_content = e.content.decode('utf-8') if e.content else str(e)
        if 'quotaExceeded' in error_content:
            print("ERROR: YouTube API quota exceeded. Falling back to scrapetube.")
        elif 'keyInvalid' in error_content:
            print("ERROR: Invalid YouTube API key. Falling back to scrapetube.")
        else:
            print(f"ERROR: YouTube API error: {error_content}. Falling back to scrapetube.")

        # Fallback to scrapetube
        return _extract_results(query, max_results)

    except Exception as e:
        print(f"ERROR: Unexpected error with YouTube API: {e}. Falling back to scrapetube.")
        return _extract_results(query, max_results)


def _parse_duration(duration_iso: str) -> str:
    """
    Parse ISO 8601 duration to readable format.
    Example: PT1H2M10S -> 1:02:10, PT5M30S -> 5:30
    """
    import re
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_iso)
    if not match:
        return "Unknown"

    hours, minutes, seconds = match.groups()
    hours = int(hours) if hours else 0
    minutes = int(minutes) if minutes else 0
    seconds = int(seconds) if seconds else 0

    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes}:{seconds:02d}"


def _evaluate_and_rank_videos(query: str, results: list[dict]) -> dict:
    """Use Gemini to evaluate and rank videos for egocentric suitability."""
    evaluation_prompt = f"""You are an expert video evaluator for Fidelity Dynamics Scene Builder Platform.

CONTEXT:
Users search for egocentric (first-person POV) videos to create robot training datasets. These videos are used to build diverse environments and teach robots real-world tasks.

EVALUATION CRITERIA (in priority order):
1. **First-Person POV Quality** (40 points): Is it true egocentric perspective? Clear first-person view?
2. **Task Clarity** (25 points): Are tasks/actions clearly visible and understandable?
3. **Environment Diversity** (15 points): Does it show diverse settings, objects, or scenarios?
4. **Hand-Object Interactions** (10 points): Are hands and object manipulations visible?
5. **Video Quality** (10 points): Good lighting, resolution, and production quality?

TASK:
Evaluate ALL {len(results)} videos and rank them by suitability score (0-100).

For each video, provide:
- **Suitability Score** (0-100): Overall score based on criteria above
- **Rank**: Position (1 = best, {len(results)} = worst)
- **Specific Reason**: 1-2 sentences explaining why this video scored high/low. Be precise and reference criteria.

OUTPUT FORMAT (JSON):
{{
  "overall_summary": "2-3 sentences about the search results quality and top recommendations",
  "rankings": [
    {{
      "video_index": 0,
      "rank": 1,
      "score": 95,
      "reason": "Excellent first-person POV with clear hand movements during cooking. Great lighting and task clarity.",
      "highlights": ["Strong POV", "Clear tasks", "Good lighting"]
    }},
    ...
  ]
}}

VIDEOS TO EVALUATE:
{json.dumps([{"index": i, "title": v["title"], "channel": v["channel"], "length": v["length"]} for i, v in enumerate(results)], indent=2)}

User Query: "{query}"

Return ONLY valid JSON, no markdown formatting.
"""

    try:
        client = _get_client()
        if not client:
            # No API key - return simple ranking
            return {
                "overall_summary": "Search results found. Add GOOGLE_API_KEY for AI-powered ranking.",
                "rankings": [
                    {"video_index": i, "rank": i+1, "score": 50, "reason": "Search result", "highlights": []}
                    for i in range(len(results))
                ]
            }

        response = client.models.generate_content(model=MODEL, contents=evaluation_prompt)
        text = (response.text or "").strip()

        # Remove markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        evaluation = json.loads(text)
        return evaluation
    except Exception as e:
        print(f"Video evaluation failed: {e}")
        # Fallback: return simple ranking
        return {
            "overall_summary": "Videos found but detailed evaluation unavailable.",
            "rankings": [
                {"video_index": i, "rank": i+1, "score": 50, "reason": "Evaluation unavailable", "highlights": []}
                for i in range(len(results))
            ]
        }


def _merge_results_with_rankings(results: list[dict], evaluation: dict) -> list[dict]:
    """Merge video data with evaluation scores and rankings."""
    # Create a mapping of video_index to ranking data
    ranking_map = {r["video_index"]: r for r in evaluation.get("rankings", [])}

    # Merge and sort by rank
    merged = []
    for i, video in enumerate(results):
        ranking_data = ranking_map.get(i, {
            "rank": i + 1,
            "score": 50,
            "reason": "Not evaluated",
            "highlights": []
        })
        merged.append({
            **video,
            "rank": ranking_data["rank"],
            "score": ranking_data["score"],
            "reason": ranking_data["reason"],
            "highlights": ranking_data.get("highlights", [])
        })

    # Sort by rank (lower rank = better)
    merged.sort(key=lambda x: x["rank"])
    return merged


def run_youtube_ai_search(
    query: str,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "relevance",
    published_after: str = None,
    duration: str = "any",
    video_type: str = "any",
    type_filter: str = "video"
) -> dict:
    """
    Run intelligent YouTube search for egocentric videos with filters.

    Args:
        query: User's search query
        page: Page number (1-indexed)
        per_page: Results per page (default 10)
        sort_by: Sort order (relevance, date, viewCount, rating)
        published_after: ISO 8601 datetime for filtering by upload date
        duration: Video duration (any, short, medium, long)
        video_type: Video type (any, episode, movie)
        type_filter: Result type (video, channel, playlist)

    Returns:
        {
            "query": original query,
            "rephrased_query": optimized query,
            "total_results": total number of results,
            "total_pages": total pages available,
            "current_page": current page number,
            "per_page": results per page,
            "results": [ranked and scored videos for current page],
            "overall_summary": AI analysis of results quality
        }
    """
    if not query:
        return {"error": "Query is required."}

    if page < 1:
        page = 1

    try:
        # Step 1: Rephrase query for egocentric video search
        rephrased_query = _rephrase_query_for_egocentric(query)
        print(f"Original query: {query}")
        print(f"Rephrased query: {rephrased_query}")

        # Step 2: Fetch 60 videos from YouTube with filters
        all_results = _extract_results_with_api(
            rephrased_query,
            max_results=60,
            sort_by=sort_by,
            published_after=published_after,
            duration=duration,
            video_type=video_type,
            type_filter=type_filter
        )

        if not all_results:
            return {
                "query": query,
                "rephrased_query": rephrased_query,
                "total_results": 0,
                "total_pages": 0,
                "current_page": page,
                "per_page": per_page,
                "results": [],
                "overall_summary": "No videos found for this query."
            }

        # Step 3: Evaluate and rank all videos with Gemini
        evaluation = _evaluate_and_rank_videos(query, all_results)

        # Step 4: Merge results with rankings
        ranked_results = _merge_results_with_rankings(all_results, evaluation)

        # Step 5: Paginate results
        total_results = len(ranked_results)
        total_pages = (total_results + per_page - 1) // per_page  # Ceiling division

        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        page_results = ranked_results[start_idx:end_idx]

        return {
            "query": query,
            "rephrased_query": rephrased_query,
            "total_results": total_results,
            "total_pages": total_pages,
            "current_page": page,
            "per_page": per_page,
            "results": page_results,
            "overall_summary": evaluation.get("overall_summary", "")
        }

    except Exception as exc:
        return {"error": f"Search failed: {exc}"}
