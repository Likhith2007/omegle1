import requests
import sys
import json
import websocket
import threading
import time
from datetime import datetime

class RandomChatAPITester:
    def __init__(self, base_url="https://random-chat-23.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
        self.tests_run = 0
        self.tests_passed = 0
        self.ws_connection = None
        self.ws_messages = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else self.api_url
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_websocket_connection(self):
        """Test WebSocket signaling server"""
        print(f"\n🔍 Testing WebSocket Connection...")
        self.tests_run += 1
        
        try:
            client_id = f"test_client_{int(time.time())}"
            ws_url = f"{self.ws_url}/ws/{client_id}"
            
            def on_message(ws, message):
                self.ws_messages.append(json.loads(message))
                print(f"   Received: {message}")
            
            def on_error(ws, error):
                print(f"   WebSocket Error: {error}")
            
            def on_close(ws, close_status_code, close_msg):
                print(f"   WebSocket Closed: {close_status_code} - {close_msg}")
            
            def on_open(ws):
                print(f"   WebSocket Connected")
                # Send ready message
                ws.send(json.dumps({"type": "ready", "interests": ["testing"]}))
                # Wait a bit then close
                time.sleep(2)
                ws.close()
            
            self.ws_connection = websocket.WebSocketApp(
                ws_url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            
            # Run WebSocket in a thread with timeout
            ws_thread = threading.Thread(target=self.ws_connection.run_forever)
            ws_thread.daemon = True
            ws_thread.start()
            ws_thread.join(timeout=5)
            
            if len(self.ws_messages) > 0:
                self.tests_passed += 1
                print(f"✅ WebSocket test passed - Received {len(self.ws_messages)} messages")
                return True
            else:
                print(f"❌ WebSocket test failed - No messages received")
                return False
                
        except Exception as e:
            print(f"❌ WebSocket test failed - Error: {str(e)}")
            return False

    def test_api_endpoints(self):
        """Test all API endpoints"""
        print("🚀 Starting Random Chat API Tests")
        print("=" * 50)
        
        # Test 1: Root endpoint
        self.run_test("Root API", "GET", "", 200)
        
        # Test 2: Config endpoint
        success, config = self.run_test("ICE Config", "GET", "config", 200)
        if success and "iceServers" in config:
            print("   ✅ ICE servers configuration found")
        
        # Test 3: Stats endpoint
        success, stats = self.run_test("Stats", "GET", "stats", 200)
        if success and "online_users" in stats:
            print(f"   ✅ Stats: {stats['online_users']} online users, {stats.get('waiting_users', 0)} waiting")
        
        # Test 4: Create user
        user_data = {
            "username": "test_user",
            "interests": ["testing", "api"],
            "age": 25,
            "gender": "other",
            "language": "en"
        }
        success, user = self.run_test("Create User", "POST", "users", 200, user_data)
        user_id = None
        if success and "id" in user:
            user_id = user["id"]
            print(f"   ✅ Created user with ID: {user_id}")
        
        # Test 5: Get user (if created successfully)
        if user_id:
            self.run_test("Get User", "GET", f"users/{user_id}", 200)
        
        # Test 6: Create report
        if user_id:
            report_data = {
                "reported_id": user_id,
                "reason": "Testing report functionality"
            }
            reporter_id = f"reporter_{int(time.time())}"
            self.run_test("Create Report", "POST", f"reports?reporter_id={reporter_id}", 200, report_data)
        
        # Test 7: WebSocket connection
        self.test_websocket_connection()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 50)
        print(f"📊 Test Summary")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("❌ Some tests failed")
            return 1

def main():
    tester = RandomChatAPITester()
    tester.test_api_endpoints()
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())