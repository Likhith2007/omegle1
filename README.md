# Omegle Clone

A real-time video chat application that connects random strangers for anonymous conversations, built with React, FastAPI, and WebRTC.

![Omegle Clone Demo](https://via.placeholder.com/800x400.png?text=Omegle+Clone+Demo)  
*Screenshot of the application in action*

## 🌟 Features

- 🔀 Random 1-on-1 video chat with strangers
- 💬 Real-time text chat
- 🎥 WebRTC for peer-to-peer video streaming
- 🎙️ Toggle audio/video during calls
- 🔄 Skip to next available user
- 🚀 FastAPI backend with WebSocket support
- 🔒 Secure peer connections with STUN servers

## 🛠 Tech Stack

**Frontend:**
- React.js
- WebRTC
- TailwindCSS
- Socket.IO Client

**Backend:**
- FastAPI
- WebSockets
- Python 3.9+

## 🚀 Prerequisites

- Node.js (v16+)
- Python (3.9+)
- npm or yarn
- Modern web browser with camera/microphone access

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Likhith2007/omegle1.git
   cd omegle1
   ```

2. **Set up the backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Set up the frontend**
   ```bash
   cd ../frontend
   npm install
   ```

## ⚙️ Configuration

1. **Backend Environment Variables**
   Create a `.env` file in the `backend` directory:
   ```env
   PORT=8000
   CORS_ORIGINS=http://localhost:3000
   ```

2. **Frontend Environment Variables**
   Create a `.env` file in the `frontend` directory:
   ```env
   REACT_APP_API_URL=http://localhost:8000
   REACT_APP_WS_URL=ws://localhost:8000/ws
   ```

## 🚀 Running the Application

1. **Start the backend server**
   ```bash
   cd backend
   uvicorn server:app --reload
   ```

2. **Start the frontend development server**
   ```bash
   cd frontend
   npm start
   ```

3. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## 📂 Project Structure

```
omegle1/
├── backend/               # FastAPI backend
│   ├── server.py         # Main FastAPI application
│   ├── requirements.txt  # Python dependencies
│   └── .env             # Environment variables
├── frontend/             # React frontend
│   ├── public/           # Static files
│   ├── src/              # React source code
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom React hooks
│   │   └── App.js        # Main App component
│   └── package.json      # Node.js dependencies
└── README.md             # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [WebRTC](https://webrtc.org/) for the real-time communication protocol
- [React](https://reactjs.org/) for the frontend framework
- [FastAPI](https://fastapi.tiangolo.com/) for the backend API
- [TailwindCSS](https://tailwindcss.com/) for styling
