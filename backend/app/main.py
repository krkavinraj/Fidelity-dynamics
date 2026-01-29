from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse 
import json
import asyncio
import os
import shutil

# --- INTERNAL MODULES ---
from .sim import SimManager
from .logger import DataLogger
from .vision import VisionPipeline
from .augment import AugmentationEngine
from .enrichment import EnrichmentPipeline
from .youtube_search import run_youtube_ai_search
from .exocentric import ExocentricExtractor
from .validation.auditor import DataAuditor
from .retargeting import KinematicSolver
from .exporters import DataExporter
from .batch_processor import create_batch_job, get_batch_status, cancel_batch_job 

app = FastAPI()

# --- PATH SETUP ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MESH_DIR = os.path.join(STATIC_DIR, "meshes")
DOWNLOAD_DIR = os.path.join(STATIC_DIR, "downloads")
DATA_DIR = os.path.join(BASE_DIR, "..", "data", "datasets")

os.makedirs(MESH_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- INITIALIZE SERVICES ---
try:
    sim = SimManager()
except Exception as exc:
    sim = None
    print(f"Sim Warning: {exc}")

logger = DataLogger()
vision = VisionPipeline()
augmenter = AugmentationEngine()
enricher = EnrichmentPipeline()
exo_extractor = ExocentricExtractor()
exporter = DataExporter()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    if sim: sim.load_env()

def _resolve_video_path(payload):
    video_rel_path = payload.get("video_path", "")
    if video_rel_path and "/static/" in video_rel_path:
        clean_rel = video_rel_path.split("/static/")[1]
        return os.path.join(STATIC_DIR, clean_rel)
    return None

# --- EXPORT ENDPOINTS ---
@app.post("/export/lerobot")
async def export_lerobot(payload: dict):
    try:
        result = exporter.to_lerobot(
            payload.get('timeline'), 
            payload.get('name'), 
            source_video_path=_resolve_video_path(payload)
        )
        if result['status'] == 'error': return result
        
        return FileResponse(
            path=result['zip_path'],
            filename=f"{payload.get('name')}_lerobot.zip",
            media_type='application/zip'
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/export/rlds")
async def export_rlds(payload: dict):
    try:
        result = exporter.to_rlds(
            payload.get('timeline'),
            payload.get('name'),
            source_video_path=_resolve_video_path(payload)
        )
        if result['status'] == 'error': return result

        return FileResponse(
            path=result['zip_path'],
            filename=f"{payload.get('name')}_rlds.zip",
            media_type='application/zip'
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/export/frames")
async def export_frames(payload: dict):
    """
    Export only frames from enrichment timeline as ZIP.
    For egocentric enrichment downloads.
    """
    try:
        result = exporter.export_frames_only(
            payload.get('timeline'),
            payload.get('name', 'enrichment_frames')
        )
        if result['status'] == 'error': return result

        return FileResponse(
            path=result['zip_path'],
            filename=f"{payload.get('name', 'enrichment')}_frames.zip",
            media_type='application/zip'
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/export/factory_sku")
async def export_factory_sku(payload: dict):
    """
    Export Factory SKU with multi-view frames, IMU data, and camera positions.
    Includes: main/side/wrist camera views, IMU sensor data, robot states, detected objects.
    """
    try:
        result = exporter.export_factory_sku(
            payload.get('timeline'),
            payload.get('name', 'factory_sku'),
            source_video_path=_resolve_video_path(payload)
        )
        if result['status'] == 'error': return result

        return FileResponse(
            path=result['zip_path'],
            filename=f"{payload.get('name', 'sku')}_factory.zip",
            media_type='application/zip'
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- RETARGETING ---
@app.post("/process/retarget")
async def process_retarget(payload: dict):
    try:
        solver = KinematicSolver()
        config = payload.get('config', {})
        joint_data = solver.solve_sequence(payload.get('timeline', []), config)
        
        updated_timeline = payload.get('timeline', [])
        for i, joints in enumerate(joint_data):
            if joints:
                if "robot_state" not in updated_timeline[i]: updated_timeline[i]["robot_state"] = {}
                updated_timeline[i]["robot_state"]["qpos"] = joints
                if "gripper_width" not in updated_timeline[i]["robot_state"]:
                    updated_timeline[i]["robot_state"]["gripper_width"] = 0.04
        
        return {"status": "ok", "timeline": updated_timeline}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- ENRICHMENT ENDPOINTS ---
@app.post("/enrich/ingest")
async def enrich_ingest(payload: dict):
    path = enricher.ingest(payload.get('type'), payload.get('url'), payload.get('token'))
    if path: return {"status": "ok", "path": path}
    return {"status": "error", "message": "Download failed"}

@app.post("/enrich/upload")
async def enrich_upload(file: UploadFile = File(...)):
    try:
        dest_path = os.path.join(DOWNLOAD_DIR, file.filename)
        with open(dest_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        return {"status": "ok", "path": f"/static/downloads/{file.filename}"}
    except Exception as exc: return {"status": "error", "message": str(exc)}

# --- NEW: DUAL UPLOAD ENDPOINT (FIXED) ---
@app.post("/enrich/upload_dual")
async def enrich_upload_dual(
    video: UploadFile = File(...), 
    sensor: UploadFile = File(None),
    mode: str = Form(...) # Fixed: Form is now imported
):
    try:
        # Save Video
        vid_filename = f"dual_{video.filename}"
        vid_path = os.path.join(DOWNLOAD_DIR, vid_filename)
        with open(vid_path, "wb") as b: shutil.copyfileobj(video.file, b)
        
        sensor_path = None
        if sensor:
            sensor_filename = f"sensor_{sensor.filename}"
            sensor_path = os.path.join(DOWNLOAD_DIR, sensor_filename)
            with open(sensor_path, "wb") as b: shutil.copyfileobj(sensor.file, b)
            
        return {
            "status": "ok", 
            "video_path": f"/static/downloads/{vid_filename}",
            "sensor_path": sensor_path 
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/enrich/process")
async def enrich_process(payload: dict, background_tasks: BackgroundTasks):
    background_tasks.add_task(enricher.process_request, payload)
    return {"status": "started"}

@app.get("/enrich/status")
async def enrich_status(): return enricher.get_status()

@app.get("/enrich/result")
async def enrich_result():
    result = enricher.get_result()
    if not result: return {"status": "error", "message": "Result not ready"}
    return {"status": "ok", "result": result}

# --- OTHER ENDPOINTS ---
@app.post("/validate/audit")
async def validate_audit(payload: dict):
    auditor = DataAuditor()
    return auditor.audit(payload.get('timeline', []), payload.get('intent', ''))

@app.post("/search/youtube")
async def search_youtube(payload: dict):
    query = (payload.get("query") or "").strip()
    filters = payload.get("filters", {})
    return run_youtube_ai_search(
        query=query,
        page=payload.get("page", 1),
        sort_by=filters.get("sortBy", "relevance"),
        published_after=filters.get("publishedAfter"),
        duration=filters.get("duration", "any"),
        video_type=filters.get("videoType", "any"),
        type_filter=filters.get("type", "video")
    )

@app.post("/enrich/batch")
async def start_batch_ingestion(payload: dict):
    """Start a batch video ingestion job."""
    videos = payload.get("videos", [])
    task_type = payload.get("taskType", "grounding")

    if not videos:
        raise HTTPException(status_code=400, detail="No videos provided")

    if task_type not in ["grounding", "factory", "exocentric"]:
        raise HTTPException(status_code=400, detail="Invalid task type")

    job_id = create_batch_job(videos, task_type)
    return {"job_id": job_id, "status": "started"}

@app.get("/enrich/batch/{job_id}/status")
async def get_batch_job_status(job_id: str):
    """Get status of a batch job."""
    status = get_batch_status(job_id)
    if "error" in status:
        raise HTTPException(status_code=404, detail=status["error"])
    return status

@app.get("/enrich/batch/{job_id}/download")
async def download_batch_zip(job_id: str):
    """Download all batch videos as ZIP - Mac compatible."""
    import tempfile
    import subprocess

    status = get_batch_status(job_id)
    if "error" in status:
        raise HTTPException(status_code=404, detail=status["error"])

    # Collect completed video files
    video_files = []
    for vid in status.get("videos", []):
        if vid["status"] == "complete" and vid.get("resultPath"):
            path = vid["resultPath"]
            if os.path.exists(path):
                video_files.append(path)
                print(f"[ZIP] Found file: {path} ({os.path.getsize(path)} bytes)")

    if not video_files:
        raise HTTPException(status_code=404, detail="No completed videos found")

    zip_path = os.path.join(DOWNLOAD_DIR, f"batch_{job_id}.zip")

    # Remove old ZIP if exists
    if os.path.exists(zip_path):
        os.remove(zip_path)

    # Use system zip command for Mac compatibility (more reliable than Python zipfile)
    try:
        # Create ZIP using system command - more Mac compatible
        cmd = ["zip", "-j", zip_path] + video_files
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        if result.returncode != 0:
            print(f"[ZIP] System zip failed: {result.stderr}")
            # Fallback to shutil
            import tempfile
            temp_dir = tempfile.mkdtemp()
            for i, vf in enumerate(video_files):
                shutil.copy(vf, os.path.join(temp_dir, f"video_{i+1}.mp4"))
            shutil.make_archive(zip_path.replace('.zip', ''), 'zip', temp_dir)
            shutil.rmtree(temp_dir)

    except Exception as e:
        print(f"[ZIP] Error: {e}, using shutil fallback")
        import tempfile
        temp_dir = tempfile.mkdtemp()
        for i, vf in enumerate(video_files):
            shutil.copy(vf, os.path.join(temp_dir, f"video_{i+1}.mp4"))
        shutil.make_archive(zip_path.replace('.zip', ''), 'zip', temp_dir)
        shutil.rmtree(temp_dir)

    if not os.path.exists(zip_path):
        raise HTTPException(status_code=500, detail="Failed to create ZIP file")

    print(f"[ZIP] Created: {zip_path} ({os.path.getsize(zip_path)} bytes)")

    return FileResponse(
        path=zip_path,
        filename=f"batch_{job_id}.zip",
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=batch_{job_id}.zip"}
    )

@app.post("/enrich/batch/{job_id}/cancel")
async def cancel_batch(job_id: str):
    """Cancel a running batch job."""
    result = cancel_batch_job(job_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.post("/exo/process")
async def process_exocentric(payload: dict):
    rel_path = payload.get("video_path")
    if not rel_path: return {"status": "error", "message": "No path provided"}
    if rel_path.startswith("http"): rel_path = "static/current_video.mp4" 
    abs_path = os.path.join(BASE_DIR, rel_path.strip("/"))
    if not os.path.exists(abs_path): return {"status": "error", "message": f"File not found: {abs_path}"}
    try: return exo_extractor.process_video(abs_path)
    except Exception as e: return {"status": "error", "message": str(e)}

@app.post("/robot/spawn")
async def spawn_robot(payload: dict):
    _require_sim()
    pos = payload.get("pos", [0, 0, 0])
    physics_pos = [pos[0], -pos[2], pos[1]] 
    sim.spawn_robot_at(physics_pos)
    return {"status": "ok"}

@app.post("/vision/segment")
async def segment_click(payload: dict):
    _require_sim()
    data = vision.segment_object(payload['x'], payload['y'], payload['type'])
    if data:
        if data.get('texture_update'): sim.load_static_scene("scene_background.obj")
        z = payload.get('z_offset', 0.0)
        sim.spawn_custom_mesh(
            mesh_filename=data['mesh_path'],
            pos=[data['pos'][0], data['pos'][1], data['pos'][2]+z],
            is_ghost=data['is_ghost'],
            mass=data.get('mass', 0.2),
            collision_filename=data.get('collision_path')
        )
    return {"status": "spawned", "data": data}

@app.post("/env/load")
async def load_environment(payload: dict):
    _require_sim()
    sim.load_prebuilt_env(payload.get("type", "default"))
    return {"status": "ok"}

@app.post("/reset")
async def reset_env(payload: dict):
    _require_sim()
    if payload.get("randomize"): sim.randomize_domain()
    else: sim.load_env()
    return {"status": "ok"}

@app.post("/record/start")
async def start_record(payload: dict):
    logger.start(payload.get("task_name", "task"))
    return {"status": "recording_started", "file": logger.file_path}

@app.post("/record/stop")
async def stop_record(payload: dict):
    path = logger.stop(payload.get("success", False))
    return {"status": "stopped", "path": path}

@app.get("/dataset/latest")
async def get_latest_dataset():
    path = augmenter.get_latest_file()
    return {"filename": os.path.basename(path) if path else "No Data"}

@app.post("/dataset/augment")
async def augment_dataset(payload: dict):
    filename = augmenter.get_latest_file()
    if not filename: return {"status": "error"}
    return augmenter.augment_file(filename, payload.get('types', []))

@app.post("/ingest/youtube")
async def ingest_yt(payload: dict):
    path = vision.download_youtube(payload['url'])
    return {"video_path": path}

@app.post("/ingest/upload")
async def upload_video(file: UploadFile = File(...)):
    file_location = os.path.join(STATIC_DIR, "current_video.mp4")
    with open(file_location, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "path": "/static/current_video.mp4"}

@app.post("/scene/freeze")
async def freeze_scene(payload: dict):
    _require_sim()
    if vision.capture_frame(payload['time']):
        sim.load_static_scene("scene_background.obj")
        return {"status": "ok"}
    return {"status": "error"}

def _require_sim():
    if not sim:
        raise HTTPException(status_code=503, detail=f"Simulation unavailable: {SIM_ERROR or 'unknown error'}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    if not sim:
        await websocket.send_json({"error": f"Simulation unavailable: {SIM_ERROR or 'unknown error'}"})
        await websocket.close()
        return
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            action = payload.get("action")
            locks = payload.get("locks", [False,False,False])
            speed = payload.get("speed", 1.0)
            state = sim.step(action, axis_locks=locks, speed=speed)
            if logger.recording and action and action.get('right'):
                imgs = sim.get_all_camera_images()
                logger.log_step(state["robots"]["right"], action["right"], imgs)
            await websocket.send_json({"robots": state["robots"], "objects": state["objects"]})
            await asyncio.sleep(0.016)
    except: pass