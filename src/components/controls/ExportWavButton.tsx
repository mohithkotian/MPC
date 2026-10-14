import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { renderProjectToWav } from '../../services/audio/wavExport';

type ExportState = 'idle' | 'rendering' | 'done' | 'error';

/**
 * Real WAV export of the sequenced performance: renders audio offline,
 * shows progress, and offers an explicit download of the generated file.
 */
export const ExportWavButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { projectId, projectName, projectArtist, bpm, swing, masterVolume, activeBank, banks, patterns, padSampleState } = useStore();
  const [state, setState] = useState<ExportState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const blobUrlRef = useRef<string | null>(null);
  const fileNameRef = useRef('mpc-session.wav');

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const exportWav = async () => {
    if (state === 'rendering') return;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setState('rendering');
    setProgress(0);
    setError('');
    try {
      const blob = await renderProjectToWav(
        {
          id: projectId,
          name: projectName,
          artist: projectArtist,
          bpm,
          swing,
          masterVolume,
          activeBank,
          banks,
          patterns,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        (done, total) => setProgress(Math.round((done / total) * 100)),
        { padSampleState }
      );
      blobUrlRef.current = URL.createObjectURL(blob);
      const safeName = (projectName || 'mpc-session').replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'mpc-session';
      fileNameRef.current = `${safeName}.wav`;
      setState('done');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'WAV export failed');
    }
  };

  const download = () => {
    if (!blobUrlRef.current) return;
    const link = document.createElement('a');
    link.href = blobUrlRef.current;
    link.download = fileNameRef.current;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void exportWav()}
          disabled={state === 'rendering'}
          className="p-1.5 rounded text-gray-400 hover:text-orange-400 disabled:opacity-50 border border-transparent hover:border-orange-500/40"
          title={state === 'rendering' ? `Rendering ${progress}%` : 'Export the performance as a WAV file'}
          aria-label="Export WAV"
        >
          {state === 'rendering' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        </button>
        {state === 'rendering' && <span className="text-[9px] font-mono text-orange-400">{progress}%</span>}
        {state === 'done' && (
          <button
            type="button"
            onClick={download}
            className="text-[9px] font-black px-2 py-1 rounded bg-emerald-800/70 hover:bg-emerald-700 text-emerald-100 border border-emerald-500/50 tracking-wider"
            title="Download the rendered WAV file"
          >
            SAVE .WAV
          </button>
        )}
        {state === 'error' && (
          <span className="max-w-40 truncate text-[9px] text-red-400" title={error}>
            EXPORT FAILED
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2 w-full">
      <button
        type="button"
        onClick={() => void exportWav()}
        disabled={state === 'rendering'}
        className="w-full py-2 rounded bg-gradient-to-b from-orange-600 to-orange-800 disabled:from-gray-700 disabled:to-gray-800 text-white font-extrabold text-xs uppercase border border-orange-400/60 disabled:border-gray-600 shadow-[0_0_10px_rgba(255,102,0,0.2)] hover:brightness-110 active:scale-95 transition-all duration-150 flex items-center justify-center space-x-1.5"
        title="Render the sequenced performance to a WAV file"
      >
        {state === 'rendering' ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>RENDERING {progress}%</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT WAV</span>
          </>
        )}
      </button>

      {state === 'rendering' && (
        <div className="w-full h-1.5 bg-[#0a0b0e] rounded overflow-hidden border border-[#1e2028]">
          <div className="h-full bg-gradient-to-r from-orange-600 to-amber-400 transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>
      )}

      {state === 'done' && (
        <button
          type="button"
          onClick={download}
          className="w-full py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-xs uppercase border border-emerald-400/60 flex items-center justify-center space-x-1.5 active:scale-95 transition-all duration-150"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>DOWNLOAD {fileNameRef.current.toUpperCase()}</span>
        </button>
      )}

      {state === 'error' && (
        <div className="flex items-start space-x-1.5 text-[10px] text-red-300 bg-red-950/40 border border-red-800/50 rounded px-2 py-1.5" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
