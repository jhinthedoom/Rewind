import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, RotateCcw, Sparkles, FileText, Calendar, Edit3, Palette } from 'lucide-react';
import { EmailTemplateConfig } from '../types';
import { DEFAULT_TEMPLATE_CONFIGS } from '../utils/templateConfigs';

interface TemplateEditorModalProps {
  templateId: string;
  config: EmailTemplateConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedConfig: EmailTemplateConfig) => void;
  onReset: (templateId: string) => void;
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  templateId,
  config,
  isOpen,
  onClose,
  onSave,
  onReset,
}) => {
  const [currentConfig, setCurrentConfig] = useState<EmailTemplateConfig>(config);
  const [activeTab, setActiveTab] = useState<'content' | 'instructions' | 'styling'>('content');

  // Sync state if modal reopens with different config
  React.useEffect(() => {
    setCurrentConfig(config);
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleAddTip = () => {
    setCurrentConfig({
      ...currentConfig,
      tipsOrNotes: [...(currentConfig.tipsOrNotes || []), ''],
    });
  };

  const handleTipChange = (index: number, val: string) => {
    const updated = [...(currentConfig.tipsOrNotes || [])];
    updated[index] = val;
    setCurrentConfig({ ...currentConfig, tipsOrNotes: updated });
  };

  const handleRemoveTip = (index: number) => {
    const updated = (currentConfig.tipsOrNotes || []).filter((_, i) => i !== index);
    setCurrentConfig({ ...currentConfig, tipsOrNotes: updated });
  };

  const handleResetToDefault = () => {
    const def = DEFAULT_TEMPLATE_CONFIGS[templateId];
    if (def) {
      setCurrentConfig(def);
      onReset(templateId);
    }
  };

  const handleSave = () => {
    onSave(currentConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#EADDCF]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#FAF4F0] border-b border-[#EADDCF] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: currentConfig.accentColor || '#C86A4B' }}
            >
              <Edit3 size={16} />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-[#2D241E]">
                Edit Template: {currentConfig.name}
              </h3>
              <p className="text-xs text-[#8C7E74]">
                Customize default subject, greetings, headings, and instructions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#8C7E74] hover:text-[#2D241E] rounded-full hover:bg-black/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex border-b border-[#EADDCF] px-6 bg-white gap-4 text-xs font-bold pt-2">
          <button
            onClick={() => setActiveTab('content')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'content'
                ? 'border-[#C86A4B] text-[#C86A4B]'
                : 'border-transparent text-[#8C7E74] hover:text-[#2D241E]'
            }`}
          >
            <FileText size={14} />
            Subject & Greeting
          </button>
          <button
            onClick={() => setActiveTab('instructions')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'instructions'
                ? 'border-[#C86A4B] text-[#C86A4B]'
                : 'border-transparent text-[#8C7E74] hover:text-[#2D241E]'
            }`}
          >
            <Sparkles size={14} />
            Instructions / Bullet Points
          </button>
          <button
            onClick={() => setActiveTab('styling')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'styling'
                ? 'border-[#C86A4B] text-[#C86A4B]'
                : 'border-transparent text-[#8C7E74] hover:text-[#2D241E]'
            }`}
          >
            <Palette size={14} />
            Branding & Header
          </button>
        </div>

        {/* Modal Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'content' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Default Email Subject Line
                </label>
                <input
                  type="text"
                  value={currentConfig.subject}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, subject: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-sm font-semibold text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                />
                <p className="text-[10px] text-[#8C7E74] mt-1">
                  Variables supported:{' '}
                  <code className="bg-stone-100 px-1 py-0.5 rounded text-[10px] text-stone-700 font-mono">
                    {`{{customerName}}, {{workshop}}, {{date}}`}
                  </code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Lead Greeting Line
                </label>
                <input
                  type="text"
                  value={currentConfig.leadGreeting}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, leadGreeting: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-sm font-semibold text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Opening Intro Paragraph / Lead Message
                </label>
                <textarea
                  rows={4}
                  value={currentConfig.leadMessage}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, leadMessage: e.target.value })
                  }
                  className="w-full p-3.5 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Closing / Rescheduling Note
                </label>
                <textarea
                  rows={2}
                  value={currentConfig.footerNote || ''}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, footerNote: e.target.value })
                  }
                  className="w-full p-3 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-xs text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                />
              </div>
            </div>
          )}

          {activeTab === 'instructions' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                  Section Title (e.g. Tips for Your Session or Pickup Instructions)
                </label>
                <input
                  type="text"
                  value={currentConfig.tipsOrNotesTitle || ''}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, tipsOrNotesTitle: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-sm font-semibold text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider">
                  List Items & Guidelines
                </label>
                {(currentConfig.tipsOrNotes || []).map((tip, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#EFE4DC] text-[#5A4E47] text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={tip}
                      onChange={(e) => handleTipChange(idx, e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-xs text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTip(idx)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Remove item"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddTip}
                  className="mt-2 px-3 py-1.5 rounded-xl border border-dashed border-[#C86A4B] text-xs font-bold text-[#C86A4B] hover:bg-[#FAF4F0] transition-colors"
                >
                  + Add Another Bullet Point
                </button>
              </div>
            </div>
          )}

          {activeTab === 'styling' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                    Email Header Banner Title
                  </label>
                  <input
                    type="text"
                    value={currentConfig.headerTitle}
                    onChange={(e) =>
                      setCurrentConfig({ ...currentConfig, headerTitle: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-sm font-semibold text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-1">
                    Email Header Sub-Banner
                  </label>
                  <input
                    type="text"
                    value={currentConfig.headerSubtitle}
                    onChange={(e) =>
                      setCurrentConfig({ ...currentConfig, headerSubtitle: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-[#FAF4F0] border border-[#EADDCF] rounded-xl text-sm text-[#2D241E] focus:outline-none focus:border-[#C86A4B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#8C7E74] uppercase tracking-wider mb-2">
                  Header Accent Color
                </label>
                <div className="flex items-center gap-3">
                  {[
                    { label: 'Terracotta', color: '#C86A4B' },
                    { label: 'Eucalyptus Green', color: '#5B8266' },
                    { label: 'Charcoal Black', color: '#2D241E' },
                    { label: 'Warm Ochre', color: '#C28B38' },
                    { label: 'Pottery Sage', color: '#8B9A82' },
                  ].map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setCurrentConfig({ ...currentConfig, accentColor: c.color })}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        currentConfig.accentColor === c.color ? 'scale-110 border-stone-800' : 'border-white shadow-xs'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                  <input
                    type="color"
                    value={currentConfig.accentColor || '#C86A4B'}
                    onChange={(e) =>
                      setCurrentConfig({ ...currentConfig, accentColor: e.target.value })
                    }
                    className="w-8 h-8 rounded-lg cursor-pointer border border-[#EADDCF]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#FAF4F0] border-t border-[#EADDCF] flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3.5 py-2 text-xs font-bold text-[#8C7E74] hover:text-[#2D241E] flex items-center gap-1.5 hover:bg-black/5 rounded-xl transition-colors"
          >
            <RotateCcw size={14} />
            Reset to Default
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#8C7E74] hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-[#C86A4B] hover:bg-[#B3593B] flex items-center gap-1.5 shadow-sm"
            >
              <Check size={14} />
              Save Template Changes
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
