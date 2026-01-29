import uvicorn
import os
import sys

# This line fixes the error by adding the current folder to Python's path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    try:
        # Check if app folder exists
        if not os.path.exists("app"):
            print("Error: 'app' folder not found. Make sure you are in 'telesim/backend/'")
            sys.exit(1)
            
        print("Starting TeleSim Backend...")
        uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)
        
    except ImportError as e:
        print(f"Import Error: {e}")
        print("Fix: Ensure 'app/__init__.py' exists.")