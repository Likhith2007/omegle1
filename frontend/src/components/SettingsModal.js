import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { toast } from "sonner";

const SettingsModal = ({ isOpen, onClose }) => {
  const [interests, setInterests] = useState([]);
  const [currentInterest, setCurrentInterest] = useState("");

  const handleAddInterest = () => {
    if (currentInterest.trim() && interests.length < 5) {
      setInterests([...interests, currentInterest.trim()]);
      setCurrentInterest("");
    } else if (interests.length >= 5) {
      toast.error("Maximum 5 interests allowed");
    }
  };

  const handleRemoveInterest = (index) => {
    setInterests(interests.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    // Save preferences (can be stored in localStorage or sent to backend)
    localStorage.setItem("user_interests", JSON.stringify(interests));
    toast.success("Preferences saved!");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="settings-modal" data-testid="settings-modal">
        <DialogHeader>
          <DialogTitle>Chat Preferences</DialogTitle>
          <DialogDescription>
            Set your interests to get matched with like-minded strangers.
          </DialogDescription>
        </DialogHeader>

        <div className="settings-form">
          <div className="form-group">
            <Label htmlFor="interest">Your Interests</Label>
            <div className="interest-input-group">
              <Input
                id="interest"
                placeholder="Add an interest (e.g., music, gaming)"
                value={currentInterest}
                onChange={(e) => setCurrentInterest(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddInterest()}
                data-testid="interest-input"
              />
              <Button
                onClick={handleAddInterest}
                disabled={!currentInterest.trim() || interests.length >= 5}
                data-testid="add-interest-btn"
              >
                Add
              </Button>
            </div>
            <p className="input-hint">{interests.length}/5 interests</p>
          </div>

          <div className="interests-list" data-testid="interests-list">
            {interests.map((interest, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="interest-badge"
                data-testid={`interest-badge-${index}`}
              >
                {interest}
                <button
                  onClick={() => handleRemoveInterest(index)}
                  className="remove-btn"
                  data-testid={`remove-interest-${index}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="modal-actions">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="cancel-settings-btn"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} data-testid="save-settings-btn">
              Save Preferences
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;