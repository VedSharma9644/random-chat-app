import { useState, useEffect } from 'react';

type ServerStatus = 'checking' | 'online' | 'offline';

export const useServerHealth = () => {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/status`);
      if (response.ok) {
        const data = await response.json();
        console.log('Server status:', data);
        setStatus('online');
        setError(null);
      } else {
        setStatus('offline');
        setError('Server returned an error status');
      }
    } catch (err) {
      console.error('Server connectivity error:', err);
      setStatus('offline');
      setError('Unable to connect to server');
    }
  };

  useEffect(() => {
    checkHealth();
    // Check health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return { status, error, checkHealth };
}; 