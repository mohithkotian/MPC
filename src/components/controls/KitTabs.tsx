import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { PRESET_KITS } from '../../services/audio/presetKits';
import { Edit2, Check, Sparkles } from 'lucide-react';

export const KitTabs: React.FC = () => {
  const { activePresetId, customKitNames, loadPresetKit, renameKit } = useStore();
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');

  const kitIds = Object.keys(PRESET_KITS);

  const handleStartRename = (kitId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingKitId(kitId);
    setTempName(currentName);
  };

  const handleSaveRename = (kitId: string) => {
    if (tempName.trim()) {
      renameKit(kitId, tempName.trim());
    }
    setEditingKitId(null);
  };

  return (
    <div className="flex items-center space-x-1.5 overflow-x-auto py-1 font-hardware select-none custom-scrollbar">
      <div className="flex items-center space-x-1 mr-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
        <Sparkles className="w-3 h-3 text-orange-400" />

      </div>

      {kitIds.map((kitId) => {
        const isSelected = activePresetId === kitId;
        const kitName = customKitNames[kitId] || PRESET_KITS[kitId].name;
        const isEditing = editingKitId === kitId;

        return (
          <div
            key={kitId}
            onClick={() => {
              if (!isSelected) {
                loadPresetKit(kitId);
              }
            }}
            className={`min-w-[84px] h-7 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all duration-150 flex items-center justify-center space-x-1.5 cursor-pointer shrink-0 ${isSelected
                ? 'bg-gradient-to-b from-[#e65c00] to-[#b33600] text-white border-orange-300 shadow-[0_0_12px_rgba(255,102,0,0.4)]'
                : 'bg-[#181920] text-gray-400 border-[#2a2d36] hover:border-gray-500 hover:text-white'
              }`}
          >
            {isEditing ? (
              <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(kitId);
                    if (e.key === 'Escape') setEditingKitId(null);
                  }}
                  autoFocus
                  className="w-20 bg-black/80 text-white px-1 py-0.5 rounded border border-orange-400 text-[11px] font-bold outline-none uppercase"
                />
                <button
                  onClick={() => handleSaveRename(kitId)}
                  className="p-0.5 text-emerald-400 hover:text-emerald-300"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <span className="uppercase tracking-wide">{kitName}</span>
                {isSelected && (
                  <button
                    onClick={(e) => handleStartRename(kitId, kitName, e)}
                    className="opacity-70 hover:opacity-100 text-white/90 hover:text-white transition-opacity ml-1"
                    title="Rename Kit"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
