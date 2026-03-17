import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Copy,
  MessageCircle,
  Send,
  LogOut,
  MonitorUp,
  Home,
  Settings,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import useWebRTC from "@/hooks/useWebRTC";
import ReportModal from "@/components/ReportModal";
import SettingsModal from "@/components/SettingsModal";
import "@/styles/chat.css";

const ChatPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const action = location.state?.action || "join";

  const {
    localVideoRef,
    remoteVideoRef,
    connectionState,
    chatMessages,
    sendChatMessage,
    leaveRoom, // renamed skipToNext to leaveRoom correctly in hook
    disconnect,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    isConnected,
    subtitles,
    translationLanguage,
    setTranslationLanguage,
    peerId
  } = useWebRTC(roomId, action); // Pass roomId and action to hook

  const [message, setMessage] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const chatEndRef = useRef(null);

  const [engagement, setEngagement] = useState({ score: null, emotion: null });

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Engagement tracking
  useEffect(() => {
    let interval;
    if (isConnected && isVideoEnabled) {
      interval = setInterval(async () => {
        if (!localVideoRef.current) return;
        const video = localVideoRef.current;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.5);

          try {
            const res = await fetch("http://localhost:8000/api/analyze-engagement", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image_b64: dataUrl })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.score !== undefined) {
                setEngagement({ score: data.score, emotion: data.emotion });
              }
            }
          } catch (e) {
            console.error(e);
          }
        }
      }, 10000); // Analyze every 10 seconds
    }
    return () => clearInterval(interval);
  }, [isConnected, isVideoEnabled, localVideoRef]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      sendChatMessage(message);
      setMessage("");
    }
  };

  const handleLeave = async () => {
    await leaveRoom();
    navigate(`/summary/${roomId}`);
  };

  const handleDisconnect = () => {
    disconnect();
    navigate(`/summary/${roomId}`);
  };

  const handleReport = () => {
    setShowReportModal(true);
  };

  const getStatusBadge = () => {
    switch (connectionState) {
      case "waiting":
        return (
          <Badge className="status-badge waiting" data-testid="status-waiting">
            <span className="pulse-dot"></span>
            Searching...
          </Badge>
        );
      case "connecting":
        return (
          <Badge className="status-badge connecting" data-testid="status-connecting">
            Connecting...
          </Badge>
        );
      case "connected":
        return (
          <Badge className="status-badge connected" data-testid="status-connected">
            <span className="pulse-dot green"></span>
            Connected
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="chat-page">
      {/* Header */}
      <header className="chat-header">
        <div className="header-left">
          <h1 className="chat-logo" data-testid="chat-logo">E1 Chat</h1>
          {getStatusBadge()}
        </div>
        <div className="header-right">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettingsModal(true)}
            data-testid="settings-btn"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            data-testid="home-btn"
          >
            <Home className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="chat-container">
        {/* Video Section */}
        <div className="video-section">
          {/* Remote Video - ALWAYS RENDERED */}
          <div className="video-wrapper remote-wrapper" data-testid="remote-video-wrapper">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="video-element"
              data-testid="remote-video"
              style={{
                display: isConnected ? 'block' : 'none',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                backgroundColor: 'black'
              }}
            />
            {!isConnected && (
              <div className="video-placeholder" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#1a1a1a'
              }}>
                <div className="placeholder-content">
                  {connectionState === "waiting" && (
                    <>
                      <div className="loading-spinner"></div>
                      <p>Searching for a stranger...</p>
                      <div className="mt-4 flex flex-col items-center bg-black/50 p-4 rounded-lg border border-gray-700">
                        <p className="text-sm text-gray-400 mb-2">Share this code with your meeting partner:</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xl font-mono text-purple-400 bg-black px-3 py-1 rounded">{roomId}</code>
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => {
                              navigator.clipboard.writeText(roomId);
                              toast.success("Room code copied!");
                            }}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                  {connectionState === "connecting" && (
                    <>
                      <div className="loading-spinner"></div>
                      <p>Connecting...</p>
                    </>
                  )}
                  {connectionState === "disconnected" && (
                    <p>No one connected</p>
                  )}
                </div>
              </div>
            )}
            <span className="video-label">Stranger</span>
            {subtitles.remote && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-lg text-center max-w-[80%] z-50">
                {subtitles.remote}
              </div>
            )}
          </div>

          {/* Local Video */}
          <div className="video-wrapper local-wrapper" data-testid="local-video-wrapper">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="video-element"
              data-testid="local-video"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                backgroundColor: 'black'
              }}
            />
            <span className="video-label">You</span>
            {engagement.score !== null && (
              <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded-md text-xs z-50 flex flex-col items-end shadow-sm">
                <span className="font-bold text-green-400">Focus: {engagement.score}/100</span>
                <span className="text-gray-300">{engagement.emotion}</span>
              </div>
            )}
            {subtitles.local && (
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-2 py-1 rounded-md text-sm text-center max-w-[90%] z-50">
                {subtitles.local}
              </div>
            )}
          </div>

          {/* Video Controls */}
          <div className="video-controls">
            <Button
              onClick={toggleVideo}
              variant={isVideoEnabled ? "default" : "destructive"}
              size="icon"
              className="control-btn"
              data-testid="toggle-video-btn"
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </Button>
            <Button
              onClick={toggleAudio}
              variant={isAudioEnabled ? "default" : "destructive"}
              size="icon"
              className="control-btn"
              data-testid="toggle-audio-btn"
            >
              {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>
            <Button
              onClick={toggleScreenShare}
              variant={isScreenSharing ? "default" : "secondary"}
              size="icon"
              className="control-btn"
              data-testid="toggle-screenshare-btn"
            >
              <MonitorUp className="w-5 h-5" />
            </Button>
            <Button
              onClick={handleLeave}
              variant="destructive"
              size="icon"
              className="control-btn skip-btn"
              data-testid="leave-btn"
            >
              <LogOut className="w-5 h-5" />
            </Button>
            
            <select 
              value={translationLanguage}
              onChange={(e) => setTranslationLanguage(e.target.value)}
              className="bg-black text-white border border-gray-700 rounded-md px-2 py-1 ml-2"
            >
              <option value="none">Translate: Off</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="German">German</option>
              <option value="Japanese">Japanese</option>
              <option value="Hindi">Hindi</option>
            </select>
            {isConnected && (
              <Button
                onClick={handleReport}
                variant="ghost"
                size="icon"
                className="control-btn report-btn"
                data-testid="report-btn"
              >
                <AlertTriangle className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Chat Section */}
        <div className="chat-section" data-testid="chat-section">
          <div className="chat-header-box">
            <MessageCircle className="w-5 h-5" />
            <h3>Chat</h3>
          </div>

          <div className="chat-messages" data-testid="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="no-messages">
                <p>No messages yet. Say hi!</p>
              </div>
            ) : (
              chatMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`chat-message ${msg.isOwn ? "own" : "other"}`}
                  data-testid={msg.isOwn ? "own-message" : "peer-message"}
                >
                  <div className="message-bubble">{msg.text}</div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="chat-input-form">
            <Input
              type="text"
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="chat-input"
              disabled={!isConnected}
              data-testid="chat-input"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!isConnected || !message.trim()}
              className="send-btn"
              data-testid="send-message-btn"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Modals */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        peerId={peerId}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
};

export default ChatPage;