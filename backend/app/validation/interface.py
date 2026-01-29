from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from dataclasses import dataclass

@dataclass
class ValidationResult:
    passed: bool
    score: float  # 0.0 to 1.0 (1.0 is perfect)
    issues: List[str]
    suggested_fix: Optional[str] = None

class BaseValidator(ABC):
    @property
    @abstractmethod
    def name(self) -> str: 
        pass

    @abstractmethod
    def validate(self, timeline: List[Dict]) -> ValidationResult: 
        """
        Analyze the timeline and return a result.
        timeline: List of frame dictionaries containing 'state', 'timestamp', etc.
        """
        pass

class BaseCorrector(ABC):
    @property
    @abstractmethod
    def name(self) -> str: 
        pass

    @abstractmethod
    def apply(self, timeline: List[Dict]) -> List[Dict]: 
        """
        Apply a fix to the timeline and return the modified list.
        """
        pass