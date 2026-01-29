from .validators import HandStabilityValidator, SensorSyncValidator, CommercialViabilityValidator
from .correctors import SmoothingCorrector, InterpolationCorrector

class ValidationPipeline:
    def __init__(self):
        # Register available tools
        self.correctors = {
            "Exponential Smoothing": SmoothingCorrector(alpha=0.3),
            "Linear Interpolation": InterpolationCorrector()
        }
        
    def process(self, timeline: list, mode='monocular'):
        """
        Runs the Validation -> Active Improvement loop.
        Returns cleaned timeline, logs, and final quality score.
        """
        current_data = timeline
        log = []
        final_score = 1.0
        
        log.append(f"--- Starting Validation Pipeline ({mode.upper()}) ---")

        # Select Validators based on Mode
        # Commercial Viability is critical for BOTH modes to ensure data isn't garbage
        validators = [HandStabilityValidator(), CommercialViabilityValidator()]
        
        if mode == 'sensor_rich':
            validators.append(SensorSyncValidator())

        # Pass 1: Validation & Auto-Correction Loop
        for validator in validators:
            res = validator.validate(current_data)
            final_score = min(final_score, res.score)
            
            if not res.passed or len(res.issues) > 0:
                status_icon = "❌" if not res.passed else "⚠️"
                log.append(f"{status_icon} {validator.name}: {', '.join(res.issues)}")
                
                # ACTIVE IMPROVEMENT
                if res.suggested_fix and res.suggested_fix in self.correctors:
                    corrector = self.correctors[res.suggested_fix]
                    log.append(f"   🔧 Auto-Fix Triggered: Applying {corrector.name}...")
                    
                    # Apply Fix
                    current_data = corrector.apply(current_data)
                    
                    # Re-Validate (Optional logic, for now we assume fix helps)
                    # We could re-run validate() here to confirm improvement
                elif res.suggested_fix:
                    log.append(f"   ❌ Suggested fix '{res.suggested_fix}' not found in registry.")
            else:
                log.append(f"✅ {validator.name}: Passed (Score: {res.score:.2f})")

        return {
            "timeline": current_data,
            "validation_log": log,
            "quality_score": final_score
        }