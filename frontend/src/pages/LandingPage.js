import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Video, MessageCircle, Users, Shield, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LandingPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ online_users: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get(`${API}/stats`);
        setStats(response.data);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStartChat = () => {
    navigate("/chat");
  };

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-badge">
            <Badge className="online-badge" data-testid="online-badge">
              <span className="pulse-dot"></span>
              <Users className="w-3 h-3" />
              {stats.online_users} online now
            </Badge>
          </div>
          
          <h1 className="hero-title" data-testid="hero-title">
            Meet Strangers.
            <br />
            <span className="title-gradient">Connect Instantly.</span>
          </h1>
          
          <p className="hero-subtitle" data-testid="hero-subtitle">
            Random video and text chat with people around the world.
            <br />
            Anonymous, instant, and electric.
          </p>
          
          <div className="hero-actions">
            <Button
              onClick={handleStartChat}
              className="start-chat-btn"
              size="lg"
              data-testid="start-chat-btn"
            >
              <Video className="w-5 h-5 mr-2" />
              Start Chatting
            </Button>
          </div>
        </div>

        {/* Hero Image */}
        <div className="hero-image-container">
          <div className="glow-effect"></div>
          <img
            src="https://images.unsplash.com/photo-1755157041505-b4d6d2d2bd0c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHw0fHxuZW9uJTIwcG9ydHJhaXQlMjB5b3VuZyUyMHBlcnNvbnxlbnwwfHx8fDE3NjQzNTY4NDF8MA&ixlib=rb-4.1.0&q=85"
            alt="Connect with strangers"
            className="hero-image"
          />
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="features-grid">
          <div className="feature-card" data-testid="feature-video">
            <div className="feature-icon video">
              <Video className="w-6 h-6" />
            </div>
            <h3 className="feature-title">Video & Audio</h3>
            <p className="feature-desc">
              High-quality video and audio chat with real-time peer-to-peer connection.
            </p>
          </div>

          <div className="feature-card" data-testid="feature-text">
            <div className="feature-icon text">
              <MessageCircle className="w-6 h-6" />
            </div>
            <h3 className="feature-title">Text Chat</h3>
            <p className="feature-desc">
              Don't want to show your face? Chat via text messages instantly.
            </p>
          </div>

          <div className="feature-card" data-testid="feature-match">
            <div className="feature-icon match">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="feature-title">Smart Matching</h3>
            <p className="feature-desc">
              Get matched with strangers based on your interests and preferences.
            </p>
          </div>

          <div className="feature-card" data-testid="feature-global">
            <div className="feature-icon global">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="feature-title">Global Reach</h3>
            <p className="feature-desc">
              Connect with people from every corner of the world, anytime.
            </p>
          </div>

          <div className="feature-card" data-testid="feature-anonymous">
            <div className="feature-icon anonymous">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="feature-title">Stay Anonymous</h3>
            <p className="feature-desc">
              No registration required. Your privacy is protected at all times.
            </p>
          </div>

          <div className="feature-card" data-testid="feature-skip">
            <div className="feature-icon skip">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="feature-title">Skip Anytime</h3>
            <p className="feature-desc">
              Not feeling the vibe? Skip to the next stranger with one click.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2 className="cta-title" data-testid="cta-title">
            Ready to meet someone new?
          </h2>
          <p className="cta-subtitle">
            Join thousands of users connecting right now
          </p>
          <Button
            onClick={handleStartChat}
            className="cta-btn"
            size="lg"
            data-testid="cta-btn"
          >
            <Video className="w-5 h-5 mr-2" />
            Start Now
          </Button>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;