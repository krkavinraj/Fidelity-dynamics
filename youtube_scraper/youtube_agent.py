"""this is the youtube agent that will be used to scrape youtube videos and return the transcript"""

from google import genai
import scrapetube

client = genai.Client()

model = "gemini-3-flash-preview"

query = input("Enter the query: ").strip()
max_results = 10

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

    results.append(
        {
            "title": title,
            "channel": channel,
            "length": length,
            "published": published,
            "url": url,
        }
    )
    if len(results) >= max_results:
        break

prompt = (
    "You are the YouTube results organizer for Fidelity Dynamics AI Search. "
    "Given the user query and raw results, return a neat, organized response. "
    "Use clear headings and bullet points, group by theme if possible, and "
    "highlight the most relevant items first. Keep it concise.\n\n"
    f"User query: {query}\n\n"
    f"Raw results: {results}"
)

response = client.models.generate_content(
    model=model,
    contents=prompt,
)

print(response.text)