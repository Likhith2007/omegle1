import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import json
import uuid
from typing import Dict, Optional
import asyncio
import logging
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables
load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Omegle Clone API",
    description="Backend for Omegle-like video chat application",
    version="1.0.0"
)

# Get allowed origins from environment variable or default to all
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", 
    "http://localhost:3000,http://localhost:8000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/")
async def health_check():
    return {"status": "ok", "message": "Omegle Clone API is running"}

# Store connected clients and their rooms
clients: Dict[str, WebSocket] = {}
waiting_clients: list[str] = []
rooms: Dict[str, dict] = {}  # room_id -> {client1, client2}
past_meetings: Dict[str, dict] = {}  # room_id -> meeting_data

@app.get("/api/config")
async def get_config():
    return {
        "iceServers": [
            {"urls": ["stun:stun.l.google.com:19302"]},
            {"urls": ["stun:stun1.l.google.com:19302"]},
            {"urls": ["stun:stun2.l.google.com:19302"]}
        ]
    }

@app.get("/api/stats")
async def get_stats():
    # Return count of connected WebSocket clients as online users
    return {
        "online_users": len(clients) / 2 # Optional: divide by roughly 2 since 1 room = 2 websockets, or just len(clients)
    }

from typing import Dict, Optional, Any
from pydantic import BaseModel
import base64
from io import BytesIO
from PIL import Image

class EngagementRequest(BaseModel):
    image_b64: str

@app.post("/api/analyze-engagement")
async def analyze_engagement(request: EngagementRequest):
    if not api_key:
        return {"score": 50, "emotion": "Neutral (No API Key)"}
    
    try:
        # Remove data:image/jpeg;base64, prefix if present
        b64_data = request.image_b64.split(",")[-1] if "," in request.image_b64 else request.image_b64
        image_data = base64.b64decode(b64_data)
        image = Image.open(BytesIO(image_data))
        
        prompt = """
        Analyze this webcam screenshot of a meeting participant.
        Determine their engagement score (0 to 100 as an integer) and their primary emotion (e.g. Happy, Neutral, Bored, Confused, Focused).
        Return EXACTLY a JSON format having keys "score" and "emotion".
        """
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content([prompt, image])
        import re
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
        return {"score": -1, "emotion": "Unknown"}
    except Exception as e:
        logger.error(f"Error analyzing engagement: {e}")
        return {"score": -1, "emotion": "Error"}

class TranslationRequest(BaseModel):
    text: str
    target_language: str

@app.post("/api/translate")
async def translate_text(request: TranslationRequest):
    if not api_key:
        return {"translated_text": request.text}
    try:
        prompt = f"Translate the following text to {request.target_language}. Respond ONLY with the translated text, no extra comments or quotation marks.\n\nText: {request.text}"
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        return {"translated_text": response.text.strip()}
    except Exception as e:
        logger.error(f"Error translating: {e}")
        return {"translated_text": request.text}

async def process_meeting_summary(room_id, meeting_data):
    try:
        summary_result = await generate_meeting_summary(meeting_data["transcript"], meeting_data["attendance"])
        meeting_data["summary"] = summary_result
        meeting_data["status"] = "completed"
    except Exception as e:
        logger.error(f"Failed to process summary for {room_id}: {e}")
        meeting_data["status"] = "failed"

@app.get("/api/room/{room_id}/summary")
async def get_room_summary(room_id: str):
    if room_id in past_meetings:
        return past_meetings[room_id]
    return {"status": "not_found"}

async def generate_meeting_summary(transcript_data, attendance_data):
    if not api_key:
        logger.warning("No Gemini API key found. Skipping AI summary.")
        return None
    
    if not transcript_data:
        return {"summary": "No transcript available.", "action_items": []}
    
    try:
        # Format the transcript text
        formatted_text = "\n".join([f"{item['user']}: {item['text']}" for item in transcript_data])
        
        prompt = f"""
        You are an AI meeting assistant. Analyze the following meeting transcript.
        
        Transcript:
        {formatted_text}
        
        Provide a JSON response with exactly two keys:
        1. "summary": A concise executive summary of the meeting.
        2. "action_items": A list of strings representing specific action items or tasks mentioned.
        
        Respond only with valid JSON.
        """
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        # Simple extraction of JSON
        import re
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
        return None
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        return None

def find_room_by_client(client_id: str) -> Optional[str]:
    """Find the room ID for a given client"""
    for room_id, room_data in rooms.items():
        if client_id in room_data.values():
            return room_id
    return None

def get_peer_id(room_id: str, client_id: str) -> Optional[str]:
    """Get the peer's client ID in a room"""
    if room_id not in rooms:
        return None
    room = rooms[room_id]
    if room.get("client1") == client_id:
        return room.get("client2")
    elif room.get("client2") == client_id:
        return room.get("client1")
    return None

async def cleanup_client(client_id: str):
    """Clean up a disconnected client"""
    # Remove from waiting list
    if client_id in waiting_clients:
        waiting_clients.remove(client_id)
    
    # Find and clean up room
    room_id = find_room_by_client(client_id)
    if room_id:
        peer_id = get_peer_id(room_id, client_id)
        
        # Notify peer about disconnection
        if peer_id and peer_id in clients:
            try:
                await clients[peer_id].send_text(json.dumps({
                    "type": "peer_disconnected"
                }))
            except:
                pass
        
        # Document attendance leave
        room = rooms[room_id]
        if "attendance" in room:
            room["attendance"].append({"user": client_id, "action": "left", "time": asyncio.get_event_loop().time()})
        
        # When removing room, we should trigger AI summary if there was a meaningful meeting
        if room_id not in past_meetings and (room.get("transcript") or room.get("attendance")):
            past_meetings[room_id] = {
                "transcript": room.get("transcript", []),
                "attendance": room.get("attendance", []),
                "summary": None,
                "status": "processing"
            }
            asyncio.create_task(process_meeting_summary(room_id, past_meetings[room_id]))
            
        logger.info(f"Meeting ended. Sent to AI Processing: {room_id}")
        
        # Remove room
        del rooms[room_id]
    
    # Remove client
    if client_id in clients:
        del clients[client_id]

@app.get("/api/room/{room_id}/verify")
async def verify_room(room_id: str):
    if room_id in rooms:
        return {"exists": True}
    return {"exists": False}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    clients[client_id] = websocket
    logger.info(f"✅ Client connected: {client_id}")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            
            logger.info(f"📨 Received from {client_id}: {msg_type}")
            
            if msg_type in ["create_room", "join_room"]:
                room_id = message.get("room_id")
                if not room_id:
                    continue
                
                if msg_type == "create_room":
                    if room_id in rooms:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Room already exists"}))
                        continue
                        
                    rooms[room_id] = {
                        "client1": client_id, 
                        "join_time_c1": asyncio.get_event_loop().time(),
                        "transcript": [],
                        "attendance": [{"user": client_id, "action": "joined", "time": asyncio.get_event_loop().time()}]
                    }
                    logger.info(f"🏠 {client_id} created room {room_id}")
                    await websocket.send_text(json.dumps({"type": "waiting"}))
                    
                elif msg_type == "join_room":
                    if room_id not in rooms:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Invalid room code. Room does not exist."}))
                        continue
                        
                    room = rooms[room_id]
                    # If room is full (we only support 1-on-1 for this architecture right now)
                    if "client2" in room:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Room is full"}))
                        continue
                    
                    # Join existing room
                    room["client2"] = client_id
                    room["join_time_c2"] = asyncio.get_event_loop().time()
                    room["attendance"].append({"user": client_id, "action": "joined", "time": asyncio.get_event_loop().time()})
                    peer_id = room["client1"]
                    
                    logger.info(f"👥 {client_id} joined {peer_id} in {room_id}")
                    
                    # Send pairing messages to both
                    await clients[client_id].send_text(json.dumps({
                        "type": "paired",
                        "peer_id": peer_id,
                        "room_id": room_id
                    }))
                    
                    await clients[peer_id].send_text(json.dumps({
                        "type": "paired",
                        "peer_id": client_id,
                        "room_id": room_id
                    }))
            
            elif msg_type == "disconnect":
                # Handle disconnect request
                logger.info(f"🔌 {client_id} requested disconnect")
                room_id = find_room_by_client(client_id)
                
                if room_id:
                    peer_id = get_peer_id(room_id, client_id)
                    
                    # Notify peer
                    if peer_id and peer_id in clients:
                        try:
                            await clients[peer_id].send_text(json.dumps({
                                "type": "peer_disconnected"
                            }))
                        except:
                            pass
                    
                    room = rooms[room_id]
                    if room_id not in past_meetings and (room.get("transcript") or room.get("attendance")):
                        past_meetings[room_id] = {
                            "transcript": room.get("transcript", []),
                            "attendance": room.get("attendance", []),
                            "summary": None,
                            "status": "processing"
                        }
                        asyncio.create_task(process_meeting_summary(room_id, past_meetings[room_id]))
                    
                    # Remove room
                    del rooms[room_id]
                    logger.info(f"🗑️ Room {room_id} deleted and summary processing started")
            
            elif msg_type in ["offer", "answer", "ice_candidate", "chat_message", "transcript"]:
                # Forward to peer
                room_id = find_room_by_client(client_id)
                
                if room_id:
                    room = rooms[room_id]
                    if msg_type == "transcript":
                        room.setdefault("transcript", []).append({
                            "user": client_id,
                            "text": message.get("text", "")
                        })

                    peer_id = get_peer_id(room_id, client_id)
                    
                    if peer_id and peer_id in clients:
                        if msg_type not in ["ice_candidate", "transcript"]:
                            logger.info(f"📤 Forwarding {msg_type} from {client_id} to {peer_id}")
                        await clients[peer_id].send_text(data)
                    else:
                        logger.info(f"❌ Peer {peer_id} not found for {client_id}")
                else:
                    logger.info(f"❌ No room found for {client_id}")
            
            else:
                logger.info(f"⚠️ Unknown message type: {msg_type}")
    
    except WebSocketDisconnect:
        logger.info(f"🔌 Client disconnected: {client_id}")
        await cleanup_client(client_id)
    except Exception as e:
        logger.info(f"❌ Error for {client_id}: {e}")
        await cleanup_client(client_id)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"🚀 Starting server on http://{host}:{port}")
    logger.info(f"Allowed origins: {ALLOWED_ORIGINS}")
    
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=False,
        workers=1,
        log_level="info"
    )