import React, { useEffect } from 'react';
import { Chassis } from './components/layout/Chassis';
import { MainView } from './components/views/MainView';
import { SequencerView } from './components/views/SequencerView';
import { MixerView } from './components/views/MixerView';
import { SamplingView } from './components/views/SamplingView';
import { KitBrowserModal } from './components/views/KitBrowserModal';
import { GestureController } from './components/camera/GestureController';
import { useStore } from './store/useStore';

export const App: React.FC = () => {
  const { viewMode, loadPresetKit } = useStore();

  useEffect(() => {
    loadPresetKit('kit1');
  }, [loadPresetKit]);

  return (
    <Chassis>
      {viewMode === 'MAIN' && <MainView />}
      {viewMode === 'STEP_EDIT' && <SequencerView />}
      {viewMode === 'MIXER' && <MixerView />}
      {viewMode === 'SAMPLING' && <SamplingView />}
      {viewMode === 'KITS' && <KitBrowserModal />}

      <GestureController />
    </Chassis>
  );
};

export default App;
