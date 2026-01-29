"""Batch video processing system for mass ingestion."""

import asyncio
import os
import uuid
import zipfile
import glob
import shutil
import yt_dlp
import cv2
import json
from typing import List, Dict
from datetime import datetime

# Import enrichment pipeline and exporters
from .enrichment import EnrichmentPipeline
from .exporters import DataExporter


class BatchJob:
    """Represents a batch video processing job."""

    def __init__(self, job_id: str, videos: List[str], task_type: str):
        self.job_id = job_id
        self.videos = videos
        self.task_type = task_type  # grounding, factory, exocentric
        self.status = "pending"  # pending, processing, complete, failed
        self.total = len(videos)
        self.completed = 0
        self.failed = 0
        self.current_video = None
        self.video_statuses = [
            {"url": url, "status": "pending", "title": self._extract_title(url), "downloadUrl": None}
            for url in videos
        ]
        self.created_at = datetime.now()
        self.batch_download_url = None

    def _extract_title(self, url: str) -> str:
        """Extract a simple title from video URL."""
        if "youtube.com" in url or "youtu.be" in url:
            return f"YouTube Video - {url.split('v=')[-1][:11]}"
        return url

    def get_total_duration_seconds(self) -> int:
        """Calculate total duration of all videos in seconds."""
        total = 0
        for status in self.video_statuses:
            if 'duration' in status and status['duration']:
                total += status['duration']
        return total


# In-memory job storage
batch_jobs: Dict[str, BatchJob] = {}

# Initialize enrichment and export engines (shared across all jobs)
enrichment_engine = EnrichmentPipeline()
export_engine = DataExporter()


async def process_batch_job(job_id: str):
    """Process all videos in a batch job sequentially."""
    job = batch_jobs.get(job_id)
    if not job:
        print(f"Job {job_id} not found")
        return

    job.status = "processing"

    # Get absolute paths - use app/static (where FastAPI mounts from)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(current_dir, "static", "downloads", f"batch_{job_id}")
    os.makedirs(output_dir, exist_ok=True)

    for i, video_url in enumerate(job.videos):
        job.current_video = video_url
        job.video_statuses[i]["status"] = "processing"

        try:
            print(f"[Batch {job_id}] Processing video {i+1}/{job.total}: {video_url}")

            # Step 1: Download video
            local_path, duration = await download_youtube_video(video_url)
            job.video_statuses[i]["duration"] = duration

            # Step 2: Process video based on task type
            if job.task_type == "grounding":
                result_path = await process_grounding_video(local_path, output_dir, f"video_{i+1}")
            elif job.task_type == "factory":
                result_path = await process_factory_video(local_path, output_dir, f"video_{i+1}")
            elif job.task_type == "exocentric":
                result_path = await process_exocentric_video(local_path, output_dir, f"video_{i+1}")
            else:
                raise ValueError(f"Unknown task type: {job.task_type}")

            # Step 3: Update job status
            download_url = f"/static/downloads/batch_{job_id}/{os.path.basename(result_path)}"
            job.video_statuses[i]["status"] = "complete"
            job.video_statuses[i]["downloadUrl"] = download_url
            job.video_statuses[i]["resultPath"] = result_path
            job.completed += 1

            print(f"[Batch {job_id}] Video {i+1}/{job.total} complete: {result_path}")

        except Exception as e:
            error_msg = str(e)
            # Simplify error messages for common issues
            if "HTTP Error 403" in error_msg:
                error_msg = "YouTube blocked download (403 Forbidden)"
            elif "yt-dlp failed" in error_msg:
                error_msg = "Download failed - try again later"
            elif "No such file" in error_msg:
                error_msg = "File not found after download"

            print(f"[Batch {job_id}] Error processing video {i+1}/{job.total}: {error_msg}")
            job.video_statuses[i]["status"] = "failed"
            job.video_statuses[i]["error"] = error_msg
            job.failed += 1

    # Create batch download ZIP
    try:
        job.batch_download_url = create_batch_zip(job_id, job.video_statuses, output_dir)
        job.status = "complete"
        print(f"[Batch {job_id}] Complete! {job.completed} succeeded, {job.failed} failed")
    except Exception as e:
        print(f"[Batch {job_id}] Error creating batch ZIP: {e}")
        job.status = "failed"


async def download_youtube_video(video_url: str) -> tuple:
    """
    Download video from YouTube using yt_dlp Python library.
    Uses the EXACT same method as the working enrichment.py code.

    Returns:
        tuple: (file_path, duration_seconds)
    """
    # Get absolute path for output directory - use app/static
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(current_dir, "static", "downloads")
    os.makedirs(output_dir, exist_ok=True)

    # Generate unique filename
    video_id = video_url.split('v=')[-1][:11] if 'v=' in video_url else str(uuid.uuid4())[:8]
    final_path = os.path.join(output_dir, f"batch_video_{video_id}.mp4")

    # Check if already downloaded
    if os.path.exists(final_path):
        print(f"Video already exists: {final_path}")
        # Get duration of existing file
        duration = await get_video_duration(final_path)
        return final_path, duration

    # Clean any existing temp files
    temp_pattern = os.path.join(output_dir, f"batch_temp_{video_id}.*")
    for temp_file in glob.glob(temp_pattern):
        try:
            os.remove(temp_file)
        except:
            pass

    print(f"📥 Downloading YouTube: {video_url}")

    # Use EXACT same yt_dlp options as working enrichment.py
    ydl_opts = {
        'format': '18/best[ext=mp4]',  # Same format as working code
        'outtmpl': os.path.join(output_dir, f"batch_temp_{video_id}.%(ext)s"),
        'quiet': True,
        'overwrites': True
    }

    try:
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _download_sync, ydl_opts, video_url)

        # Move temp file to final location (same as enrichment.py)
        temp_files = glob.glob(os.path.join(output_dir, f"batch_temp_{video_id}.*"))
        if temp_files:
            shutil.move(temp_files[0], final_path)
            print(f"✅ Download Complete: {final_path}")

            # Get duration
            duration = info.get('duration', 0) if info else 0
            if duration == 0:
                duration = await get_video_duration(final_path)

            return final_path, duration
        else:
            raise RuntimeError("Download completed but no file found")

    except Exception as e:
        error_msg = str(e)
        print(f"Download error: {error_msg}")
        raise RuntimeError(f"Download failed: {error_msg}")


def _download_sync(ydl_opts: dict, url: str):
    """Synchronous download helper for yt_dlp."""
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
        # Extract info to get duration
        try:
            info = ydl.extract_info(url, download=False)
            return info
        except:
            return None


async def get_video_duration(video_path: str) -> int:
    """Get video duration in seconds using opencv."""
    try:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        cap.release()
        if fps > 0:
            return int(frame_count / fps)
    except Exception as e:
        print(f"Error getting video duration: {e}")
    return 0


async def process_grounding_video(local_path: str, output_dir: str, filename: str) -> str:
    """
    Process video through REAL grounding/enrichment pipeline.
    Returns path to exported ZIP containing frames + timeline JSON.
    """
    print(f"🔬 Processing grounding video: {local_path}")

    # Verify file exists
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"Video file not found: {local_path}")

    # Create unique session ID for this video
    session_id = str(uuid.uuid4())[:8]

    # Create frames directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    frames_dir = os.path.join(current_dir, "static", "processed_frames", session_id)
    os.makedirs(frames_dir, exist_ok=True)

    # Run the REAL grounding pipeline
    loop = asyncio.get_event_loop()

    def run_pipeline():
        # Convert absolute path to relative path expected by enrichment pipeline
        rel_path = f"/static/downloads/{os.path.basename(local_path)}"
        result = enrichment_engine._run_grounding_pipeline(
            video_rel_path=rel_path,
            sensor_path=None,
            mode="monocular",
            user_prompts="tools, objects",
            frame_dir=frames_dir,
            session_id=session_id
        )
        return result

    # Run in thread pool to avoid blocking
    result = await loop.run_in_executor(None, run_pipeline)

    # Export timeline + frames as ZIP
    export_path = os.path.join(output_dir, f"{filename}_enriched.zip")

    # Create ZIP with frames + timeline JSON
    with zipfile.ZipFile(export_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add timeline JSON
        timeline_json = json.dumps(result, indent=2)
        zf.writestr("timeline.json", timeline_json)

        # Add all extracted frames
        if os.path.exists(frames_dir):
            for frame_file in os.listdir(frames_dir):
                frame_path = os.path.join(frames_dir, frame_file)
                if os.path.isfile(frame_path):
                    zf.write(frame_path, f"frames/{frame_file}")

        # Add source video
        if os.path.exists(local_path):
            zf.write(local_path, f"source_video/{os.path.basename(local_path)}")

    # Cleanup frames directory to save space
    try:
        shutil.rmtree(frames_dir)
    except:
        pass

    print(f"✅ Grounding complete: {export_path}")
    return export_path


async def process_factory_video(local_path: str, output_dir: str, filename: str) -> str:
    """
    Process video through REAL factory/foundry pipeline.
    Returns path to exported ZIP containing multi-view frames + timeline JSON.
    """
    print(f"🏭 Processing factory video: {local_path}")

    # Verify file exists
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"Video file not found: {local_path}")

    # Create unique session ID for this video
    session_id = str(uuid.uuid4())[:8]

    # Create frames directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    frames_dir = os.path.join(current_dir, "static", "processed_frames", session_id)
    os.makedirs(frames_dir, exist_ok=True)

    # Run the REAL factory pipeline
    loop = asyncio.get_event_loop()

    def run_pipeline():
        # Convert absolute path to relative path expected by enrichment pipeline
        rel_path = f"/static/downloads/{os.path.basename(local_path)}"
        result = enrichment_engine._run_factory_pipeline(
            video_rel_path=rel_path,
            user_prompts="tools, objects",
            frame_dir=frames_dir,
            session_id=session_id
        )
        return result

    # Run in thread pool to avoid blocking
    result = await loop.run_in_executor(None, run_pipeline)

    # Export timeline + multi-view frames as ZIP
    export_path = os.path.join(output_dir, f"{filename}_factory.zip")

    # Create ZIP with frames + timeline JSON
    with zipfile.ZipFile(export_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add timeline JSON
        timeline_json = json.dumps(result, indent=2)
        zf.writestr("timeline.json", timeline_json)

        # Add all multi-view frames (main, side, wrist)
        if os.path.exists(frames_dir):
            for view_dir in ["main", "side", "wrist"]:
                view_path = os.path.join(frames_dir, view_dir)
                if os.path.exists(view_path):
                    for frame_file in os.listdir(view_path):
                        frame_path = os.path.join(view_path, frame_file)
                        if os.path.isfile(frame_path):
                            zf.write(frame_path, f"frames/{view_dir}/{frame_file}")

        # Add source video
        if os.path.exists(local_path):
            zf.write(local_path, f"source_video/{os.path.basename(local_path)}")

    # Cleanup frames directory to save space
    try:
        shutil.rmtree(frames_dir)
    except:
        pass

    print(f"✅ Factory complete: {export_path}")
    return export_path


async def process_exocentric_video(local_path: str, output_dir: str, filename: str) -> str:
    """
    Process video through REAL exocentric pipeline.
    Returns path to exported ZIP containing frames + annotations JSON.
    """
    print(f"👁️ Processing exocentric video: {local_path}")

    # Verify file exists
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"Video file not found: {local_path}")

    # Import exocentric extractor
    from .exocentric import ExocentricExtractor

    # Create unique session ID for this video
    session_id = str(uuid.uuid4())[:8]

    # Run the REAL exocentric pipeline
    exo_extractor = ExocentricExtractor()
    loop = asyncio.get_event_loop()

    def run_pipeline():
        result = exo_extractor.process_video(local_path)
        return result

    # Run in thread pool to avoid blocking
    result = await loop.run_in_executor(None, run_pipeline)

    if result.get("status") == "error":
        raise Exception(result.get("message", "Exocentric processing failed"))

    # Export timeline + frames as ZIP
    export_path = os.path.join(output_dir, f"{filename}_exocentric.zip")

    # Create ZIP with frames + timeline JSON
    with zipfile.ZipFile(export_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add result JSON
        result_json = json.dumps(result, indent=2)
        zf.writestr("annotations.json", result_json)

        # Add source video
        if os.path.exists(local_path):
            zf.write(local_path, f"source_video/{os.path.basename(local_path)}")

    print(f"✅ Exocentric complete: {export_path}")
    return export_path


def create_batch_zip(job_id: str, video_statuses: List[dict], output_dir: str) -> str:
    """Create a ZIP file containing all completed exports - Mac compatible."""
    import subprocess

    zip_path = os.path.join(output_dir, f"batch_{job_id}.zip")

    try:
        # Collect files to zip
        files_to_zip = []
        for i, status in enumerate(video_statuses):
            if status["status"] == "complete" and status.get("resultPath"):
                file_path = status["resultPath"]
                if os.path.exists(file_path):
                    files_to_zip.append(file_path)
                    print(f"✓ Will add: {file_path}")

        if not files_to_zip:
            print("✗ No files to zip")
            return None

        # Use system zip command for Mac compatibility
        cmd = ["zip", "-j", zip_path] + files_to_zip
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=output_dir)

        if result.returncode == 0 and os.path.exists(zip_path):
            print(f"✓ ZIP created: {zip_path} ({os.path.getsize(zip_path)} bytes)")
            return f"/static/downloads/batch_{job_id}/batch_{job_id}.zip"
        else:
            print(f"✗ ZIP failed: {result.stderr}")
            return None

    except Exception as e:
        print(f"✗ ZIP error: {e}")
        return None


def create_batch_job(videos: List[str], task_type: str) -> str:
    """Create a new batch job and start processing in background."""
    job_id = str(uuid.uuid4())
    job = BatchJob(job_id, videos, task_type)
    batch_jobs[job_id] = job

    # Start processing in background
    asyncio.create_task(process_batch_job(job_id))

    return job_id


def get_batch_status(job_id: str) -> Dict:
    """Get current status of a batch job."""
    job = batch_jobs.get(job_id)
    if not job:
        return {"error": "Job not found"}

    # Calculate total duration
    total_duration = job.get_total_duration_seconds()

    return {
        "job_id": job.job_id,
        "status": job.status,
        "total": job.total,
        "completed": job.completed,
        "failed": job.failed,
        "current": job.current_video,
        "videos": job.video_statuses,
        "batchDownloadUrl": job.batch_download_url,
        "totalDuration": total_duration
    }


def cancel_batch_job(job_id: str) -> Dict:
    """Cancel a running batch job."""
    job = batch_jobs.get(job_id)
    if not job:
        return {"error": "Job not found"}

    if job.status == "processing":
        job.status = "cancelled"
        return {"status": "cancelled", "message": "Job cancelled successfully"}

    return {"status": job.status, "message": f"Job is already {job.status}"}
