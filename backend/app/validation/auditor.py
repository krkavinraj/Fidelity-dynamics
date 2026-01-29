import os
import json
import numpy as np
from google import genai

# Reuse the client configuration from youtube_search
def _get_client():
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

class DataAuditor:
    def __init__(self):
        self.client = _get_client()
        self.model = "gemini-2.0-flash-exp" # Fast and smart enough for JSON analysis

    def _summarize_timeline(self, timeline):
        """Compresses the timeline into a statistical summary for the LLM."""
        if not timeline:
            return "Empty Timeline"

        objects_seen = set()
        hand_present_count = 0
        max_velocity = 0.0
        interactions = 0
        
        for i, frame in enumerate(timeline):
            state = frame.get('state', {})
            
            # 1. Objects
            for obj in state.get('objects_poses', []):
                if obj.get('label'):
                    objects_seen.add(obj['label'])
            
            # 2. Hand Stats
            joints = state.get('human_joints')
            if joints:
                hand_present_count += 1
                if i > 0:
                    prev = timeline[i-1].get('state', {}).get('human_joints')
                    if prev:
                        vel = np.linalg.norm(np.array(joints) - np.array(prev))
                        if vel > max_velocity: max_velocity = vel

            # 3. Contacts
            if state.get('contacts'):
                interactions += 1

        duration = len(timeline) / 30.0 # Assuming 30fps
        
        return {
            "duration_seconds": round(duration, 2),
            "objects_detected": list(objects_seen),
            "hand_visibility_ratio": round(hand_present_count / len(timeline), 2),
            "max_hand_velocity": round(max_velocity, 2),
            "interaction_frames": interactions
        }

    def audit(self, timeline, user_intent):
        if not self.client:
            return {"passed": False, "reason": "Server missing GOOGLE_API_KEY"}

        summary = self._summarize_timeline(timeline)
        
        prompt = f"""
        You are a Robotics Data Quality Auditor. 
        Your job is to determine if a video dataset is useful for training a robot to perform a specific task.

        USER INTENT (The Task): "{user_intent}"

        DATASET SUMMARY (What the Computer Vision saw):
        {json.dumps(summary, indent=2)}

        CRITERIA:
        1. Are the necessary objects for the task present? (e.g. if task is "cut apple", is there a "knife" and "apple"?)
        2. Is there enough motion? (Duration > 0, Velocity > 0)
        3. Is the hand visible enough to learn from?

        OUTPUT JSON ONLY:
        {{
            "passed": boolean,
            "confidence": float (0.0 to 1.0),
            "reason": "Short explanation (1 sentence) of why it passed/failed based on the objects and stats."
        }}
        """

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config={'response_mime_type': 'application/json'}
            )
            return json.loads(response.text)
        except Exception as e:
            return {"passed": False, "reason": f"AI Audit Failed: {str(e)}"}