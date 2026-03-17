import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const WS_URL = BACKEND_URL.replace(/^http/, "ws");
const API = `${BACKEND_URL}/api`;

const useWebRTC = (roomIdToJoin, action = "join") => {
  const [connectionState, setConnectionState] = useState("disconnected");
  const [chatMessages, setChatMessages] = useState([]);
  const [subtitles, setSubtitles] = useState({ local: "", remote: "" });
  const [translationLanguage, setTranslationLanguage] = useState("none");
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenTrackRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const websocketRef = useRef(null);
  const localStreamRef = useRef(null);
  const clientIdRef = useRef(null);
  const iceConfigRef = useRef(null);
  const roomIdRef = useRef(null);
  const recognitionRef = useRef(null);

  // Fetch ICE configuration
  const fetchICEConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API}/config`);
      const config = await response.json();
      iceConfigRef.current = config;
      return config;
    } catch (error) {
      console.error("Error fetching ICE config:", error);
      iceConfigRef.current = {
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
      };
      return iceConfigRef.current;
    }
  }, []);

  // Initialize media devices
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        // Ensure the local video plays
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(error => {
          console.error("Error playing local video:", error);
        });
      }
    } catch (error) {
      console.error("Media access error:", error);
      toast.error("Could not access camera/microphone");
      throw error;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(async () => {
    try {
      const config = iceConfigRef.current || {
        iceServers: [
          { urls: ["stun:stun.l.google.com:19302"] },
          { urls: ["stun:stun1.l.google.com:19302"] },
          { urls: ["stun:stun2.l.google.com:19302"] },
          // Add TURN server configuration if you have one
          // {
          //   urls: "turn:your-turn-server.com:3478",
          //   username: "username",
          //   credential: "password"
          // }
        ]
      };
      
      // Make sure we have local media before creating peer connection
      if (!localStreamRef.current) {
        await initializeMedia();
      }

      console.log("Creating new peer connection with config:", config);
      const peerConnection = new RTCPeerConnection(config);

      // Add local tracks if they exist
      if (localStreamRef.current) {
        console.log("Adding local tracks to peer connection");
        localStreamRef.current.getTracks().forEach((track) => {
          console.log(`Adding ${track.kind} track to peer connection`);
          peerConnection.addTrack(track, localStreamRef.current);
        });
        
        // Verify tracks were added
        const senders = peerConnection.getSenders();
        console.log("Peer connection senders:", senders.map(s => s.track?.kind));
      }

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && websocketRef.current?.readyState === WebSocket.OPEN) {
          console.log("Sending ICE candidate:", event.candidate.candidate);
          websocketRef.current.send(
            JSON.stringify({
              type: "ice_candidate",
              candidate: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
              }
            })
          );
        } else if (!event.candidate) {
          console.log("All ICE candidates have been sent");
        }
      };

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log("Received remote track:", event.track.kind, "readyState:", event.track.readyState);
        
        // Create a new MediaStream if we don't have one yet
        if (!remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.srcObject = new MediaStream();
        }
        
        // Add the track to the stream
        const remoteStream = remoteVideoRef.current.srcObject;
        const existingTrack = remoteStream.getTracks().find(track => track.kind === event.track.kind);
        
        // Remove existing track of the same type if it exists
        if (existingTrack) {
          remoteStream.removeTrack(existingTrack);
        }
        
        // Add the new track
        remoteStream.addTrack(event.track);
        
        console.log("Added remote track to video element");
        setIsConnected(true);
        
        // Force play the video element
        remoteVideoRef.current.play().catch(error => {
          console.error("Error playing remote video:", error);
        });
        
        toast.success("Connected to stranger!");
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log("Connection state changed to:", peerConnection.connectionState);
        setConnectionState(peerConnection.connectionState);

        switch (peerConnection.connectionState) {
          case "connected":
            console.log("WebRTC connection established!");
            setIsConnected(true);
            toast.success("Connected to stranger!");
            break;
          case "disconnected":
          case "failed":
            console.error("Connection failed or disconnected");
            setIsConnected(false);
            closePeerConnection();
            // Try to reconnect if WebSocket is still open
            if (websocketRef.current?.readyState === WebSocket.OPEN && roomIdRef.current) {
               // Use action here as well if reconnecting via a join is expected, 
               // but we simply trigger "join_room" because the room already belongs to them and exists
              websocketRef.current.send(JSON.stringify({ type: "join_room", room_id: roomIdRef.current }));
            }
            break;
          case "closed":
            setIsConnected(false);
            break;
          default:
            console.log("Connection state:", peerConnection.connectionState);
        }
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === "failed") {
          console.error("ICE connection failed, attempting restart");
          peerConnection.restartIce();
        }
      };

      // Handle ICE gathering state
      peerConnection.onicegatheringstatechange = () => {
        console.log("ICE gathering state:", peerConnection.iceGatheringState);
      };

      peerConnectionRef.current = peerConnection;
      return peerConnection;
    } catch (error) {
      console.error("Error creating peer connection:", error);
      toast.error("Failed to create connection");
      throw error;
    }
  }, []);

  const peerConnectionPromiseRef = useRef(null);

  // Close peer connection
  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      console.log("Closing peer connection");
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    peerConnectionPromiseRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setIsConnected(false);
    setChatMessages([]);
    setPeerId(null);
    roomIdRef.current = null;
  }, []);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback((roomIdToJoin) => {
    clientIdRef.current = `client_${Date.now()}`;
    const ws = new WebSocket(`${WS_URL}/ws/${clientIdRef.current}`);

    ws.onopen = () => {
      console.log("WebSocket connected with client ID:", clientIdRef.current);
      setConnectionState("waiting");
      // Request matching
      const eventType = action === "create" ? "create_room" : "join_room";
      ws.send(JSON.stringify({ type: eventType, room_id: roomIdToJoin }));
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message:", message.type, message);

      switch (message.type) {
        case "waiting":
          setConnectionState("waiting");
          toast.info("Searching for a stranger...");
          break;

        case "paired":
          console.log(
            "Paired with peer:",
            message.peer_id,
            "| Self:",
            clientIdRef.current,
            "| Room:",
            message.room_id
          );
          setConnectionState("connecting");
          setPeerId(message.peer_id);
          roomIdRef.current = message.room_id;

          // FIXED: Always create peer connection when paired
          peerConnectionPromiseRef.current = createPeerConnection();
          const peerConnection = await peerConnectionPromiseRef.current;
          
          // Decide which side should create the offer to avoid glare
          const isInitiator = clientIdRef.current < message.peer_id;
          console.log("Is initiator:", isInitiator);

          if (isInitiator) {
            console.log("Creating offer as initiator");
            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            await peerConnection.setLocalDescription(offer);
            console.log("Sending offer");
            ws.send(
              JSON.stringify({
                type: "offer",
                sdp: peerConnection.localDescription.toJSON()
              })
            );
          } else {
            console.log("Waiting for offer from peer");
          }
          break;

        case "offer":
          console.log("Received offer from peer");
          // FIXED: Peer connection should already exist from 'paired' event
          let pc = peerConnectionRef.current;
          if (!pc && peerConnectionPromiseRef.current) {
            pc = await peerConnectionPromiseRef.current;
          }
          if (!pc) {
            console.error("No peer connection exists when receiving offer!");
            toast.error("Connection error - please try again");
            return;
          }

          const offer_sdp = new RTCSessionDescription(message.sdp);
          console.log("Setting remote description (offer)");
          await pc.setRemoteDescription(offer_sdp);

          console.log("Creating answer");
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          console.log("Sending answer");
          ws.send(
            JSON.stringify({
              type: "answer",
              sdp: pc.localDescription.toJSON()
            })
          );
          break;

        case "answer":
          console.log("Received answer from peer");
          const answer_sdp = new RTCSessionDescription(message.sdp);
          if (peerConnectionRef.current) {
            console.log("Setting remote description (answer)");
            await peerConnectionRef.current.setRemoteDescription(answer_sdp);
          } else {
            console.error("No peer connection when receiving answer");
          }
          break;

        case "ice_candidate":
          console.log("Received ICE candidate:", message.candidate?.candidate);
          if (peerConnectionRef.current && message.candidate) {
            try {
              const candidate = new RTCIceCandidate({
                candidate: message.candidate.candidate,
                sdpMid: message.candidate.sdpMid,
                sdpMLineIndex: message.candidate.sdpMLineIndex
              });
              await peerConnectionRef.current.addIceCandidate(candidate);
              console.log("Successfully added ICE candidate");
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          } else if (!peerConnectionRef.current) {
            console.warn("Received ICE candidate but no peer connection exists");
          }
          break;

        case "chat_message":
          setChatMessages((prev) => [
            ...prev,
            { text: message.message, isOwn: false }
          ]);
          break;

        case "transcript":
          if (translationLanguage !== "none") {
            try {
              fetch("http://localhost:8000/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: message.text, target_language: translationLanguage })
              })
              .then(res => res.json())
              .then(data => {
                setSubtitles(prev => ({ ...prev, remote: data.translated_text || message.text }));
              });
            } catch (e) {
              setSubtitles(prev => ({ ...prev, remote: message.text }));
            }
          } else {
            setSubtitles(prev => ({ ...prev, remote: message.text }));
          }
          
          // Clear subtitle after 4 seconds
          if (window.remoteSubtitleTimeout) clearTimeout(window.remoteSubtitleTimeout);
          window.remoteSubtitleTimeout = setTimeout(() => {
            setSubtitles(prev => ({ ...prev, remote: "" }));
          }, 4000);
          break;

        case "peer_disconnected":
          toast.info("Stranger disconnected");
          closePeerConnection();
          // Also redirect to summary page instead of just clearing connection state
          setTimeout(() => {
            window.location.href = `/summary/${roomIdRef.current}`;
          }, 1500);
          break;

        default:
          console.log("Unknown message type:", message.type);
          break;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast.error("Connection error");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      setConnectionState("disconnected");
    };

    websocketRef.current = ws;
  }, [createPeerConnection, closePeerConnection]);

  // Initialize everything
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      try {
        console.log("Initializing WebRTC...");
        await fetchICEConfig();
        console.log("ICE config fetched");
        await initializeMedia();
        console.log("Media initialized");
        connectWebSocket(roomIdToJoin); // USE the parameter passed to the hook
        console.log("WebSocket connecting...");
      } catch (error) {
        console.error("Initialization error:", error);
        if (isMounted) {
          toast.error("Failed to initialize: " + error.message);
        }
      }
    };

    // Add a small delay to ensure DOM is ready
    const timer = setTimeout(initialize, 1000);

    // Cleanup
    return () => {
      isMounted = false;
      clearTimeout(timer);
      
      console.log("Cleaning up WebRTC...");
      
      // Stop all media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
      
      // Close peer connection
      if (peerConnectionRef.current) {
        console.log("Closing peer connection");
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Close WebSocket
      if (websocketRef.current) {
        console.log("Closing WebSocket");
        if (websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.close();
        }
        websocketRef.current = null;
      }
      
      // Clear video elements
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    };
  }, [fetchICEConfig, initializeMedia, connectWebSocket]);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          setSubtitles(prev => ({ ...prev, local: currentText }));
          
          if (finalTranscript && websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
            websocketRef.current.send(JSON.stringify({
              type: "transcript",
              text: finalTranscript
            }));
            
            // Auto clear local subtitle
            setTimeout(() => {
              setSubtitles(prev => ({ ...prev, local: "" }));
            }, 3000);
          }
        }
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  // Manage speech recognition state based on connection and mute
  useEffect(() => {
    if (isConnected && isAudioEnabled && recognitionRef.current) {
      try { recognitionRef.current.start(); } catch (e) { /* Already started */ }
    } else if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* Already stopped */ }
      setSubtitles(prev => ({ ...prev, local: "" }));
    }
  }, [isConnected, isAudioEnabled]);

  // Smart Noise Detection (Warn if speaking while muted)
  useEffect(() => {
    let audioContext;
    let analyser;
    let microphone;
    let javascriptNode;
    let analysisStream;
    let lastWarnTime = 0;

    if (!isAudioEnabled && isConnected) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          analysisStream = stream;
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          analyser = audioContext.createAnalyser();
          microphone = audioContext.createMediaStreamSource(stream);
          
          // Use ScriptProcessor (deprecated but highly compatible) to analyze audio levels
          javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

          analyser.smoothingTimeConstant = 0.8;
          analyser.fftSize = 1024;

          microphone.connect(analyser);
          analyser.connect(javascriptNode);
          javascriptNode.connect(audioContext.destination);

          javascriptNode.onaudioprocess = () => {
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            let values = 0;

            const length = array.length;
            for (let i = 0; i < length; i++) {
              values += array[i];
            }

            const average = values / length;

            // If average volume > 30, user is speaking
            if (average > 30) {
              const now = Date.now();
              // Warn at most once every 5 seconds
              if (now - lastWarnTime > 5000) {
                toast("Microphone is muted.", {
                  description: "We detect you are speaking, but you are muted.",
                  id: "muted-warning",
                  icon: "🔇"
                });
                lastWarnTime = now;
              }
            }
          };
        })
        .catch(err => console.error("Could not access mic for noise detection:", err));
    }

    return () => {
      if (javascriptNode) {
        javascriptNode.disconnect();
        javascriptNode.onaudioprocess = null;
      }
      if (analyser) analyser.disconnect();
      if (microphone) microphone.disconnect();
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
      if (analysisStream) {
        analysisStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isAudioEnabled, isConnected]);

  // Send chat message
  const sendChatMessage = useCallback((text) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(
        JSON.stringify({
          type: "chat_message",
          message: text
        })
      );
      setChatMessages((prev) => [...prev, { text, isOwn: true }]);
    }
  }, []);

  // Skip to next stranger -> Changed to "Leave Room" internally or just reset
  const skipToNext = useCallback(async () => {
    closePeerConnection();
    setChatMessages([]);
    setConnectionState("disconnected");

    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({ type: "disconnect" }));
    }
  }, [closePeerConnection]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (websocketRef.current) {
      websocketRef.current.send(JSON.stringify({ type: "disconnect" }));
      websocketRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    closePeerConnection();
  }, [closePeerConnection]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, []);

  // Toggle screen share
  const stopScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    
    if (peerConnectionRef.current && localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
        // Restore local video preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    }
    setIsScreenSharing(false);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
      }

      // Update local preview
      if (localVideoRef.current) {
        const newStream = new MediaStream([screenTrack]);
        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (audioTrack) newStream.addTrack(audioTrack);
        }
        localVideoRef.current.srcObject = newStream;
      }

      setIsScreenSharing(true);

      // Listen for browser's native "Stop sharing" button
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error("Error starting screen share:", error);
      toast.error("Could not share screen");
    }
  }, [isScreenSharing, stopScreenShare]);

  return {
    localVideoRef,
    remoteVideoRef,
    connectionState,
    chatMessages,
    sendChatMessage,
    leaveRoom: skipToNext, // Renamed skipToNext to leaveRoom as per the provided code edit
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
  };
};

export default useWebRTC;