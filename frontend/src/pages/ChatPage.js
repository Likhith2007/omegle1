import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  SkipForward,
  MessageCircle,
  Send,
  AlertTriangle,
  Home,
  Settings
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
  const navigate = useNavigate();
  const {
    localVideoRef,
    remoteVideoRef,
    connectionState,
    chatMessages,
    sendChatMessage,
    skipToNext,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    isConnected,
    peerId
  } = useWebRTC();

  const [message, setMessage] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      sendChatMessage(message);
      setMessage("");
    }
  };

  const handleSkip = async () => {
    await skipToNext();
    toast.info("Searching for a new stranger...");
  };

  const handleDisconnect = () => {
    disconnect();
    navigate("/");
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
              onClick={handleSkip}
              variant="secondary"
              size="icon"
              className="control-btn skip-btn"
              disabled={!isConnected && connectionState !== "waiting"}
              data-testid="skip-btn"
            >
              <SkipForward className="w-5 h-5" />
            </Button>
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