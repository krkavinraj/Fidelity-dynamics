import numpy as np
import copy
from .interface import BaseCorrector

class SmoothingCorrector(BaseCorrector):
    name = "Exponential Smoothing"
    
    def __init__(self, alpha=0.3):
        self.alpha = alpha

    def apply(self, timeline: list) -> list:
        """
        Applies Exponential Moving Average (EMA) to 'human_joints'.
        Reduces high-frequency jitter.
        """
        cleaned = copy.deepcopy(timeline)
        history = None
        
        for frame in cleaned:
            # Check if 'state' and 'human_joints' exist
            state = frame.get('state', {})
            joints = state.get('human_joints')
            
            if joints:
                curr = np.array(joints)
                if history is None:
                    history = curr
                else:
                    # EMA Formula: new = alpha * current + (1-alpha) * history
                    history = (self.alpha * curr) + ((1 - self.alpha) * history)
                    frame['state']['human_joints'] = history.tolist()
            else:
                # If hand is lost, reset history to avoid dragging old position
                history = None
                
        return cleaned

class InterpolationCorrector(BaseCorrector):
    name = "Linear Interpolation"

    def apply(self, timeline: list) -> list:
        """
        Fills in gaps (None) in 'human_joints' using Linear Interpolation.
        """
        cleaned = copy.deepcopy(timeline)
        
        # 1. Identify indices that have valid data
        indices_with_data = []
        for i, frame in enumerate(cleaned):
            if frame.get('state', {}).get('human_joints'):
                indices_with_data.append(i)
        
        if len(indices_with_data) < 2: 
            return cleaned

        # 2. Iterate through valid indices and find gaps
        for i in range(len(indices_with_data) - 1):
            start_idx = indices_with_data[i]
            end_idx = indices_with_data[i+1]
            gap_size = end_idx - start_idx
            
            # If gap is > 1, it means there are missing frames in between
            if gap_size > 1:
                start_val = np.array(cleaned[start_idx]['state']['human_joints'])
                end_val = np.array(cleaned[end_idx]['state']['human_joints'])
                
                # Propagate contact state from start of gap
                contact_state = cleaned[start_idx]['state'].get('contacts', 0)
                
                # Fill the gap
                for step in range(1, gap_size):
                    # Linear interpolation: val = start + (end - start) * t
                    t = step / gap_size
                    interp_val = start_val + (end_val - start_val) * t
                    
                    target_idx = start_idx + step
                    cleaned[target_idx]['state']['human_joints'] = interp_val.tolist()
                    cleaned[target_idx]['state']['contacts'] = contact_state
        
        return cleaned