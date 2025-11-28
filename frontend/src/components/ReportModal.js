import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ReportModal = ({ isOpen, onClose, peerId }) => {
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!peerId) {
      toast.error("No peer to report");
      return;
    }

    setIsSubmitting(true);
    try {
      const reporterId = `reporter_${Date.now()}`;
      await axios.post(`${API}/reports?reporter_id=${reporterId}`, {
        reported_id: peerId,
        reason: `${reason}: ${details}`
      });
      toast.success("Report submitted. Thank you!");
      onClose();
      setDetails("");
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error("Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="report-modal" data-testid="report-modal">
        <DialogHeader>
          <DialogTitle>Report User</DialogTitle>
          <DialogDescription>
            Help us keep the community safe. Please select a reason for reporting this user.
          </DialogDescription>
        </DialogHeader>

        <div className="report-form">
          <div className="form-group">
            <Label>Reason</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              <div className="radio-item">
                <RadioGroupItem value="inappropriate" id="inappropriate" />
                <Label htmlFor="inappropriate">Inappropriate behavior</Label>
              </div>
              <div className="radio-item">
                <RadioGroupItem value="spam" id="spam" />
                <Label htmlFor="spam">Spam or scam</Label>
              </div>
              <div className="radio-item">
                <RadioGroupItem value="harassment" id="harassment" />
                <Label htmlFor="harassment">Harassment or bullying</Label>
              </div>
              <div className="radio-item">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other">Other</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="form-group">
            <Label htmlFor="details">Additional Details (Optional)</Label>
            <Textarea
              id="details"
              placeholder="Provide more information..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              data-testid="report-details"
            />
          </div>

          <div className="modal-actions">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="cancel-report-btn"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              data-testid="submit-report-btn"
            >
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportModal;