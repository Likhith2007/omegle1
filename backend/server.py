from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import uuid
from typing import Dict, Optional
import asyncio

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store connected clients and their rooms
clients: Dict[str, WebSocket] = {}
waiting_clients: list[str] = []
rooms: Dict[str, dict] = {}  # room_id -> {client1, client2}

@app.get("/api/config")
async def get_config():
    return {
        "iceServers": [
            {"urls": ["stun:stun.l.google.com:19302"]},
            {"urls": ["stun:stun1.l.google.com:19302"]},
            {"urls": ["stun:stun2.l.google.com:19302"]}
        ]
    }

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
        
        # Remove room
        del rooms[room_id]
    
    # Remove client
    if client_id in clients:
        del clients[client_id]

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    clients[client_id] = websocket
    print(f"✅ Client connected: {client_id}")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            
            print(f"📨 Received from {client_id}: {msg_type}")
            
            if msg_type == "ready":
                # Try to match with a waiting client
                if waiting_clients:
                    peer_id = waiting_clients.pop(0)
                    
                    # Create a room
                    room_id = str(uuid.uuid4())
                    rooms[room_id] = {
                        "client1": client_id,
                        "client2": peer_id
                    }
                    
                    print(f"👥 Paired {client_id} with {peer_id} in room {room_id}")
                    
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
                else:
                    # Add to waiting list
                    if client_id not in waiting_clients:
                        waiting_clients.append(client_id)
                    print(f"⏳ {client_id} added to waiting list")
                    await websocket.send_text(json.dumps({"type": "waiting"}))
            
            elif msg_type == "disconnect":
                # Handle disconnect request
                print(f"🔌 {client_id} requested disconnect")
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
                    
                    # Remove room
                    del rooms[room_id]
                    print(f"🗑️ Room {room_id} deleted")
            
            elif msg_type in ["offer", "answer", "ice_candidate", "chat_message"]:
                # Forward to peer
                room_id = find_room_by_client(client_id)
                
                if room_id:
                    peer_id = get_peer_id(room_id, client_id)
                    
                    if peer_id and peer_id in clients:
                        print(f"📤 Forwarding {msg_type} from {client_id} to {peer_id}")
                        await clients[peer_id].send_text(data)
                    else:
                        print(f"❌ Peer {peer_id} not found for {client_id}")
                else:
                    print(f"❌ No room found for {client_id}")
            
            else:
                print(f"⚠️ Unknown message type: {msg_type}")
    
    except WebSocketDisconnect:
        print(f"🔌 Client disconnected: {client_id}")
        await cleanup_client(client_id)
    except Exception as e:
        print(f"❌ Error for {client_id}: {e}")
        await cleanup_client(client_id)

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting server on http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)