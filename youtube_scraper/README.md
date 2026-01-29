# YouTube AI Search Agent

AI-powered YouTube search that finds and ranks egocentric first-person POV videos for robot training data.

## Features

- **Gemini-powered query optimization** - Rephrases user queries to find egocentric content
- **Smart ranking** - Evaluates 50-60 videos based on:
  - First-person POV quality (40%)
  - Task clarity (25%)
  - Environment diversity (15%)
  - Hand-object interactions (10%)
  - Video quality (10%)
- **Pagination** - 10 videos per page with detailed scores and reasons

## Setup

### 1. Install Dependencies

```bash
pip install google-genai scrapetube
```

### 2. Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy the key

### 3. Set Environment Variable

**macOS/Linux:**
```bash
export GOOGLE_API_KEY="your-api-key-here"
```

**Windows:**
```cmd
set GOOGLE_API_KEY=your-api-key-here
```

**Or add to `.env` file:**
```
GOOGLE_API_KEY=your-api-key-here
```

### 4. Start Backend

```bash
cd backend
python run.py
```

## Usage

Access AI Search at `http://localhost:5173` → Click "AI Search" card → Enter search query (e.g., "cooking pasta", "assembling furniture")

The agent will:
1. Rephrase your query for egocentric video discovery
2. Fetch 60 videos from YouTube
3. Rank them using Gemini based on training data suitability
4. Display top 10 with scores, reasons, and highlights

## API Endpoint

```
POST /search/youtube
{
  "query": "first person cooking",
  "page": 1
}
```

Returns ranked videos with scores, reasons, highlights, and pagination data.
