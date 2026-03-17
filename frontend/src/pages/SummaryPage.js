import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, Home, CheckSquare, List } from 'lucide-react';
import axios from 'axios';

const SummaryPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval;
    let retries = 0;
    const fetchSummary = async () => {
      try {
        const response = await axios.get(`http://localhost:8000/api/room/${roomId}/summary`);
        if (response.data.status === 'not_found') {
          retries++;
          if (retries > 3) {
            setData({ status: 'failed', error: 'Meeting not found or was too short.' });
            setLoading(false);
            clearInterval(interval);
          }
        } else if (response.data.status !== 'processing') {
          setData(response.data);
          setLoading(false);
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error fetching summary:', error);
      }
    };

    fetchSummary();
    interval = setInterval(fetchSummary, 3000);

    return () => clearInterval(interval);
  }, [roomId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
        <Loader2 className="w-12 h-12 animate-spin mb-4 text-purple-500" />
        <h2 className="text-2xl font-bold">Generating AI Meeting Summary...</h2>
        <p className="text-gray-400 mt-2">Gemini is analyzing your transcript and extracting action items.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            Meeting Insights
          </h1>
          <Button onClick={() => navigate('/')} variant="outline" className="border-gray-700 text-black hover:text-white">
            <Home className="w-4 h-4 mr-2" /> Home
          </Button>
        </div>

        {data.status === 'failed' ? (
          <div className="bg-red-900/50 border border-red-500 p-6 rounded-lg text-center">
            <h2 className="text-xl font-bold text-red-200 mb-2">Failed to generate summary</h2>
            <p className="text-red-300">Could not process the meeting transcript or AI service is unavailable.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-gray-900 border-gray-800 text-white">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  <List className="w-5 h-5 mr-2 text-purple-400" />
                  Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 leading-relaxed">
                  {data.summary?.summary || "No summary available."}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800 text-white">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  <CheckSquare className="w-5 h-5 mr-2 text-pink-400" />
                  Action Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.summary?.action_items?.length > 0 ? (
                  <ul className="space-y-3">
                    {data.summary.action_items.map((item, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="h-6 w-6 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-xs mr-3 mt-0.5 flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-gray-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 italic">No action items detected.</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800 text-white md:col-span-2 mt-4">
              <CardHeader>
                <CardTitle className="flex items-center text-xl">
                  Transcript Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-black p-4 rounded-md max-h-60 overflow-y-auto font-mono text-sm">
                  {data.transcript?.length > 0 ? (
                    data.transcript.map((item, idx) => (
                      <div key={idx} className="mb-2">
                        <span className="text-purple-400 font-bold mr-2">{item.user.substring(0, 4)}:</span>
                        <span className="text-gray-300">{item.text}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-600">Transcript is empty.</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryPage;
