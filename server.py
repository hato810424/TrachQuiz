import asyncio
import json
import threading
import time
import os
import logging
import logging.config
import yaml
from typing import List, Optional
from pathlib import Path

import nfc
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles

# Configuration
NFC_MAPPING_FILE = "rules/nfc_mapping.json"
LOGGING_CONFIG_FILE = "logging.yaml"
LOG_DIR = "log"

# --- Logging Setup ---
def setup_logging():
    # Ensure log directory exists as handlers might fail otherwise if logic isn't inside handler
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)
        
    if os.path.exists(LOGGING_CONFIG_FILE):
        with open(LOGGING_CONFIG_FILE, 'rt') as f:
            try:
                config = yaml.safe_load(f.read())
                logging.config.dictConfig(config)
            except Exception as e:
                print(f"Error loading logging config: {e}")
                logging.basicConfig(level=logging.INFO)
    else:
        print("Logging config file not found, using default.")
        logging.basicConfig(level=logging.INFO)
    
    return logging.getLogger("TrachQuizServer")

logger = setup_logging()

app = FastAPI()

# Store connected clients
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error sending message: {e}")

manager = ConnectionManager()

# --- NFC Logic ---

def load_mapping():
    try:
        with open(NFC_MAPPING_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning(f"{NFC_MAPPING_FILE} not found.")
        return {}
    except Exception as e:
        logger.error(f"Error loading mapping file: {e}")
        return {}

def on_connect_wrapper(tag, loop_instance):
    """
    Wrapper to pass the loop instance to the actual handler
    """
    try:
        # Log all tag data as requested
        logger.info(f"Tag detected details: {tag}")
        
        uid = tag.identifier.hex().upper()
        logger.info(f"UID detected: {uid}")
        
        mapping = load_mapping()
        category = mapping.get(uid)
        
        if category:
            logger.info(f"Matched Category: {category} for UID: {uid}")
            message = json.dumps({"type": "answer", "category": category})
            asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop_instance)
        else:
            logger.info(f"UID {uid} not found in mapping.")
        
    except Exception as e:
        logger.error(f"Error in on_connect_wrapper: {e}")

    # Return True to signal that we processed this tag presence.
    return False

def nfc_worker(loop_instance):
    """
    Background worker to poll NFC reader.
    """
    logger.info("NFC Worker started...")
    clf = nfc.ContactlessFrontend()
    try:
        # Try to open the first available USB reader
        if not clf.open('usb'):
            logger.error("Could not open NFC reader. Is it connected?")
            return
            
        logger.info(f"NFC Reader opened: {clf.device}")
        
        while True:
            # poll for a tag
            try:
                clf.connect(rdwr={'on-connect': lambda tag: on_connect_wrapper(tag, loop_instance)})
            except Exception as connect_err:
                 # Sometimes connect raises exceptions on timeout or device errors, catch to keep worker alive
                 logger.warning(f"clf.connect exception: {connect_err}")
            
            # Small delay
            time.sleep(0.5) 
            
    except Exception as e:
        logger.critical(f"NFC Worker fatal error: {e}")
    finally:
        clf.close()
        logger.info("NFC Reader closed.")

# Global reference to the loop
loop = None

@app.on_event("startup")
async def startup_event():
    global loop
    loop = asyncio.get_running_loop()
    logger.info("Server starting up...")
    
    # Start NFC worker in a separate thread
    t = threading.Thread(target=nfc_worker, args=(loop,), daemon=True)
    t.start()

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection open and just log received text
            data = await websocket.receive_text() 
            logger.debug(f"Received from client: {data}")
            
            # Web NFC debugger からのデータを処理
            try:
                msg = json.loads(data)
                if msg.get("type") == "nfc_debug":
                    uid = msg.get("uid")
                    logger.info(f"Web NFC Debug detected UID: {uid}")
                    
                    mapping = load_mapping()
                    category = mapping.get(uid)
                    
                    if category:
                        logger.info(f"Matched Category from Web NFC: {category} for UID: {uid}")
                        broadcast_msg = json.dumps({"type": "answer", "category": category})
                        await manager.broadcast(broadcast_msg)
                    else:
                        logger.info(f"Web NFC UID {uid} not found in mapping.")
            except Exception as e:
                logger.error(f"Error processing websocket data: {e}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket endpoint error: {e}")
        manager.disconnect(websocket)

# --- API Routes (must be defined before static files mount) ---
# @app.get("/api/rules/{city}")
# async def get_rules(city: str):
#     """Serve rules JSON for a specific city"""
#     rules_file = Path("rules") / f"{city}.json"
#     if rules_file.exists():
#         with open(rules_file, 'r', encoding='utf-8') as f:
#             return json.load(f)
#     raise HTTPException(status_code=404, detail=f"Rules not found for {city}")

# --- Static Files Setup (mount last to avoid intercepting API routes) ---
# Mount rules folder for static JSON files
rules_dir = Path("rules")
if rules_dir.exists():
    app.mount("/rules", StaticFiles(directory=str(rules_dir)), name="rules")
else:
    logger.warning(f"Rules directory not found: {rules_dir}")

# Mount public folder for static files
public_dir = Path("public")
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    # Log dir creation is handled in setup_logging but if we run via uvicorn directly that might be skipped if we didn't call it.
    # But logger = setup_logging() is at module level, so it runs on import.
    uvicorn.run(app, host="0.0.0.0", port=8000)
