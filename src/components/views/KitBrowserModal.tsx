import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { loadProjectsFromDB } from '../../services/db/storage';
import { ProjectData } from '../../types';
import { PRESET_KITS } from '../../services/audio/presetKits';
import { Folder, Save, Disc, Sparkles, CheckCircle2 } from 'lucide-react';

export const KitBrowserModal: React.FC = () => {
  const {
    projectName,
    activePresetId,
    loadPresetKit,
    saveCurrentProject,
    loadProjectFromStorage,
  } = useStore();

  const [savedProjects, setSavedProjects] = useState<ProjectData[]>([]);
  const [newProjectName, setNewProjectName] = useState(projectName);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchSavedProjects = async () => {
    const list = await loadProjectsFromDB();
    setSavedProjects(list);
  };

  useEffect(() => {
    fetchSavedProjects();
  }, []);

  const handleSave = async () => {
    if (!newProjectName.trim()) return;
    await saveCurrentProject(newProjectName.trim());
    await fetchSavedProjects();
    setStatusMessage('Project saved!');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleLoadPreset = async (kitId: string) => {
    setStatusMessage(`Loading ${kitId.toUpperCase()}...`);
    await loadPresetKit(kitId);
    setNewProjectName(PRESET_KITS[kitId].name);
    setStatusMessage(`Loaded "${PRESET_KITS[kitId].name}"`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleLoadUserProject = async (project: ProjectData) => {
    setStatusMessage(`Loading "${project.name}"...`);
    await loadProjectFromStorage(project);
    setNewProjectName(project.name);
    setStatusMessage(`Loaded "${project.name}"`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-[#12131a] p-6 rounded-xl border border-[#1e2028] font-hardware select-none animate-slide-in">
      <div className="flex items-center justify-between border-b border-[#1e2028] pb-3 mb-5">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Disc className="w-5 h-5 text-orange-500" />
            Kits & Projects
          </h2>
          <p className="text-xs text-gray-500">Load kits or manage saved projects.</p>
        </div>
        {statusMessage && (
          <div className="flex items-center space-x-1.5 bg-emerald-950/50 text-emerald-300 border border-emerald-800/50 px-3 py-1.5 rounded text-xs font-bold animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-[#1e2028] pb-2 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-orange-400/70" />
            KITS
          </h3>

          <div className="space-y-3">
            {Object.values(PRESET_KITS).map((kit) => (
              <div
                key={kit.id}
                className={`p-4 rounded-lg border transition-all duration-150 ${activePresetId === kit.id
                    ? 'bg-[#1a1410] border-orange-500/40 shadow-[0_0_16px_rgba(255,102,0,0.15)]'
                    : 'bg-[#0e0f14] border-[#1e2028] hover:border-[#2a2d36]'
                  }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-black text-white uppercase">{kit.name}</h4>
                  <span className="text-[9px] font-mono font-bold text-orange-400/70 bg-black/40 px-2 py-0.5 rounded border border-[#1e2028]">
                    {kit.bpm} BPM
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">{kit.description}</p>
                <button
                  onClick={() => handleLoadPreset(kit.id)}
                  className="w-full py-2 rounded bg-[#1a1c22] text-xs font-extrabold uppercase text-gray-300 border border-[#2a2d36] hover:text-white hover:border-orange-500/50 hover:bg-[#1e2028] shadow-beveled-btn transition-all duration-150"
                >
                  LOAD KIT
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-[#1e2028] pb-2 flex items-center gap-1.5">
            <Folder className="w-4 h-4 text-orange-400/70" />
            SAVED PROJECTS
          </h3>

          <div className="bg-[#0e0f14] p-4 rounded-lg border border-[#1e2028] space-y-3">
            <span className="text-[9px] font-black text-gray-500 uppercase block tracking-wider">SAVE CURRENT</span>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name..."
                className="flex-1 bg-[#0a0b0e] border border-[#1e2028] px-3 py-2 rounded text-xs font-bold text-white focus:outline-none focus:border-orange-500/50 transition-colors"
              />
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded bg-gradient-to-b from-orange-600 to-orange-800 text-white font-extrabold text-xs uppercase border border-orange-400/60 shadow-[0_0_10px_rgba(255,102,0,0.2)] flex items-center space-x-1.5 hover:brightness-110 active:scale-95 transition-all duration-150"
              >
                <Save className="w-3.5 h-3.5" />
                <span>SAVE</span>
              </button>
            </div>
          </div>

          <div className="bg-[#0e0f14] p-4 rounded-lg border border-[#1e2028] space-y-3">
            <span className="text-[9px] font-black text-gray-500 uppercase block tracking-wider">LOAD SAVED</span>
            {savedProjects.length === 0 ? (
              <p className="text-xs text-gray-600 font-mono italic">No saved projects.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {savedProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="flex items-center justify-between bg-[#0a0b0e] p-2.5 rounded border border-[#1e2028] hover:border-[#2a2d36] transition-colors"
                  >
                    <div>
                      <h5 className="text-xs font-extrabold text-white">{proj.name}</h5>
                      <span className="text-[9px] font-mono text-gray-600">
                        {new Date(proj.updatedAt).toLocaleDateString()} // {proj.bpm} BPM
                      </span>
                    </div>
                    <button
                      onClick={() => handleLoadUserProject(proj)}
                      className="px-3 py-1 rounded bg-[#1a1c22] hover:bg-orange-600 hover:text-white text-[10px] font-bold text-gray-400 border border-[#2a2d36] transition-all duration-150"
                    >
                      LOAD
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
