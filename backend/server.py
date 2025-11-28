from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone
import json
import random
import socketio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: Optional[str] = None
    interests: List[str] = Field(default_factory=list)
    age: Optional[int] = None
    gender: Optional[str] = None
    language: Optional[str] = "en"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: Optional[str] = None
    interests: List[str] = Field(default_factory=list)
    age: Optional[int] = None
    gender: Optional[str] = None
    language: Optional[str] = "en"

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_id: str
    sender_id: str
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Report(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    reporter_id: str
    reported_id: str
    reason: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReportCreate(BaseModel):
    reported_id: str
    reason: str

class ICEConfig(BaseModel):
    iceServers: List[Dict]

# Connection manager for WebSocket signaling
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.connection_metadata: Dict[str, dict] = {}
        self.waiting_users: List[str] = []
        self.rooms: Dict[str, dict] = {}

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.connection_metadata[client_id] = {
            "status": "connected",
            "room": None,
            "peer_id": None,
            "interests": []
        }
        logger.info(f"Client {client_id} connected")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if client_id in self.connection_metadata:
            del self.connection_metadata[client_id]
        if client_id in self.waiting_users:
            self.waiting_users.remove(client_id)
        logger.info(f"Client {client_id} disconnected")

    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
                self.disconnect(client_id)

    async def broadcast_to_room(self, message: dict, room_id: str, exclude_client: Optional[str] = None):
        if room_id in self.rooms:
            for user_id in self.rooms[room_id]["users"]:
                if user_id != exclude_client and user_id in self.active_connections:
                    await self.send_personal_message(message, user_id)

    def generate_room_id(self) -> str:
        return str(uuid.uuid4())

    async def match_users(self, client_id: str, interests: List[str] = []):
        # Update client metadata with interests
        if client_id in self.connection_metadata:
            self.connection_metadata[client_id]["interests"] = interests

        # Try to find a match from waiting users
        best_match = None
        best_score = -1

        for waiting_user in self.waiting_users:
            if waiting_user == client_id:
                continue
            
            # Calculate match score based on common interests
            waiting_interests = self.connection_metadata.get(waiting_user, {}).get("interests", [])
            common_interests = set(interests) & set(waiting_interests)
            score = len(common_interests)

            if score > best_score:
                best_score = score
                best_match = waiting_user

        if best_match:
            # Match found, create room
            room_id = self.generate_room_id()
            self.waiting_users.remove(best_match)
            
            self.rooms[room_id] = {
                "users": [client_id, best_match],
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            # Update metadata
            self.connection_metadata[client_id]["room"] = room_id
            self.connection_metadata[client_id]["peer_id"] = best_match
            self.connection_metadata[client_id]["status"] = "paired"

            self.connection_metadata[best_match]["room"] = room_id
            self.connection_metadata[best_match]["peer_id"] = client_id
            self.connection_metadata[best_match]["status"] = "paired"

            # Notify both users
            await self.send_personal_message(
                {"type": "paired", "room_id": room_id, "peer_id": best_match},
                client_id
            )
            await self.send_personal_message(
                {"type": "paired", "room_id": room_id, "peer_id": client_id},
                best_match
            )
            return True
        else:
            # No match found, add to waiting list
            if client_id not in self.waiting_users:
                self.waiting_users.append(client_id)
            self.connection_metadata[client_id]["status"] = "waiting"
            await self.send_personal_message({"type": "waiting"}, client_id)
            return False

    async def leave_room(self, client_id: str):
        metadata = self.connection_metadata.get(client_id, {})
        room_id = metadata.get("room")
        peer_id = metadata.get("peer_id")

        if room_id and room_id in self.rooms:
            # Notify peer
            if peer_id:
                await self.send_personal_message({"type": "peer_disconnected"}, peer_id)
                # Reset peer metadata
                if peer_id in self.connection_metadata:
                    self.connection_metadata[peer_id]["room"] = None
                    self.connection_metadata[peer_id]["peer_id"] = None
                    self.connection_metadata[peer_id]["status"] = "connected"

            # Delete room
            del self.rooms[room_id]

        # Reset client metadata
        if client_id in self.connection_metadata:
            self.connection_metadata[client_id]["room"] = None
            self.connection_metadata[client_id]["peer_id"] = None
            self.connection_metadata[client_id]["status"] = "connected"


manager = ConnectionManager()

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Random Chat API", "status": "online"}

@api_router.get("/config")
async def get_config():
    """Provide ICE server configuration to clients"""
    return {
        "iceServers": [
            {"urls": ["stun:stun.l.google.com:19302"]},
            {"urls": ["stun:stun1.l.google.com:19302"]}
        ]
    }

@api_router.get("/stats")
async def get_stats():
    """Get online users count"""
    return {
        "online_users": len(manager.active_connections),
        "waiting_users": len(manager.waiting_users),
        "active_rooms": len(manager.rooms)
    }

@api_router.post("/users", response_model=User)
async def create_user(user_input: UserCreate):
    user_dict = user_input.model_dump()
    user = User(**user_dict)
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    return user

@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(user['created_at'], str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    return user

@api_router.post("/reports", response_model=Report)
async def create_report(reporter_id: str, report_input: ReportCreate):
    report_dict = report_input.model_dump()
    report = Report(reporter_id=reporter_id, **report_dict)
    
    doc = report.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    await db.reports.insert_one(doc)
    return report

@api_router.get("/messages/{room_id}", response_model=List[ChatMessage])
async def get_room_messages(room_id: str):
    messages = await db.messages.find({"room_id": room_id}, {"_id": 0}).to_list(100)
    
    for msg in messages:
        if isinstance(msg['timestamp'], str):
            msg['timestamp'] = datetime.fromisoformat(msg['timestamp'])
    
    return messages

# WebSocket endpoint for signaling
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(client_id, websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            message_type = message.get("type")
            
            logger.info(f"Received {message_type} from {client_id}")
            
            if message_type == "ready":
                # User is ready to be matched
                interests = message.get("interests", [])
                await manager.match_users(client_id, interests)
            
            elif message_type == "offer":
                # Forward SDP offer to peer
                metadata = manager.connection_metadata.get(client_id, {})
                peer_id = metadata.get("peer_id")
                if peer_id:
                    await manager.send_personal_message(
                        {
                            "type": "offer",
                            "sdp": message.get("sdp"),
                            "from": client_id
                        },
                        peer_id
                    )
            
            elif message_type == "answer":
                # Forward SDP answer to peer
                metadata = manager.connection_metadata.get(client_id, {})
                peer_id = metadata.get("peer_id")
                if peer_id:
                    await manager.send_personal_message(
                        {
                            "type": "answer",
                            "sdp": message.get("sdp"),
                            "from": client_id
                        },
                        peer_id
                    )
            
            elif message_type == "ice_candidate":
                # Forward ICE candidate to peer
                metadata = manager.connection_metadata.get(client_id, {})
                peer_id = metadata.get("peer_id")
                if peer_id:
                    await manager.send_personal_message(
                        {
                            "type": "ice_candidate",
                            "candidate": message.get("candidate"),
                            "from": client_id
                        },
                        peer_id
                    )
            
            elif message_type == "chat_message":
                # Forward text chat message to peer
                metadata = manager.connection_metadata.get(client_id, {})
                peer_id = metadata.get("peer_id")
                room_id = metadata.get("room")
                
                if peer_id and room_id:
                    # Save message to database
                    chat_msg = ChatMessage(
                        room_id=room_id,
                        sender_id=client_id,
                        message=message.get("message", "")
                    )
                    doc = chat_msg.model_dump()
                    doc['timestamp'] = doc['timestamp'].isoformat()
                    await db.messages.insert_one(doc)
                    
                    # Forward to peer
                    await manager.send_personal_message(
                        {
                            "type": "chat_message",
                            "message": message.get("message"),
                            "from": client_id,
                            "timestamp": chat_msg.timestamp.isoformat()
                        },
                        peer_id
                    )
            
            elif message_type == "disconnect":
                # User explicitly disconnecting
                await manager.leave_room(client_id)
                await manager.send_personal_message({"type": "disconnected"}, client_id)
    
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
        await manager.leave_room(client_id)
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"Error in WebSocket for {client_id}: {e}")
        await manager.leave_room(client_id)
        manager.disconnect(client_id)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()