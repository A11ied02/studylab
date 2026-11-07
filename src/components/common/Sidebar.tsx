import React from 'react';
import {
  BookOpen,
  Atom,
  Calculator,
  Globe2,
  Languages,
  Cpu,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useLibrary } from '../../context/LibraryContext';

const SUBJECT_ICONS: Record<string, React.ReactNode> = {
  Science: <Atom size={19} strokeWidth={1.7} className="text-white" />,
  Maths: <Calculator size={19} strokeWidth={1.7} className="text-white" />,
  'Social Science': <Globe2 size={19} strokeWidth={1.7} className="text-white" />,
  English: <BookOpen size={19} strokeWidth={1.7} className="text-white" />,
  Hindi: <Languages size={19} strokeWidth={1.7} className="text-white" />,
  IT: <Cpu size={19} strokeWidth={1.7} className="text-white" />,
};

export const Sidebar: React.FC = () => {
  const {
    subjects,
    selectedSubject,
    activeTab,
    setActiveTab,
    sidebarExpanded,
    toggleSidebar,
    navigateToSubject,
    navigateToBooksHome,
  } = useLibrary();

  return (
    <aside
      className={`hidden md:flex h-full bg-bg-sidebar border-r border-bg-border flex-col py-4 shrink-0 z-20 select-none rounded-tr-2xl rounded-br-2xl transition-all duration-300 ease-in-out ${
        sidebarExpanded ? 'w-56 px-3' : 'w-16 px-2 items-center'
      }`}
    >
      {/* 
        Top Header Area with Flash Logo and Sidebar Expand/Collapse Toggle:
        - When COLLAPSED: Logo sits on top, expand button sits directly below it
        - When EXPANDED: Logo sits on LEFT, collapse/close button sits on the RIGHT of the logo
        - Everything transitions cleanly in one smooth animation
      */}
      <div className={`w-full flex items-center mb-3 transition-all duration-300 ${
        sidebarExpanded ? 'justify-between px-1' : 'flex-col gap-2.5 items-center'
      }`}>
        {/* Flash Icon App Logo */}
        <div
          onClick={() => { navigateToBooksHome(); }}
          title="Studylab"
          className="flex items-center gap-2.5 cursor-pointer select-none"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="shrink-0 drop-shadow-[0_0_10px_rgba(66,133,244,0.6)]">
            <defs>
              <linearGradient id="flaskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4285f4" />
                <stop offset="100%" stopColor="#1a73e8" />
              </linearGradient>
            </defs>
            <path
              d="M10 2v5.5L4.4 17.8c-.8 1.4.2 3.2 1.8 3.2h11.6c1.6 0 2.6-1.8 1.8-3.2L14 7.5V2"
              stroke="url(#flaskGrad)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M8.5 2h7" stroke="url(#flaskGrad)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M7 16h10" stroke="url(#flaskGrad)" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
          </svg>

          {sidebarExpanded && (
            <span className="font-bold text-white tracking-wide text-sm">
              Studylab
            </span>
          )}
        </div>

        {/* 
          Expand/Collapse Button:
          - When EXPANDED: placed on the RIGHT side of the logo
          - When COLLAPSED: placed directly below the logo
        */}
        <button
          onClick={toggleSidebar}
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className={`rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors ${
            sidebarExpanded ? 'w-8 h-8' : 'w-10 h-10'
          }`}
        >
          {sidebarExpanded ? (
            <PanelLeftClose size={19} strokeWidth={1.8} className="text-white" />
          ) : (
            <PanelLeft size={19} strokeWidth={1.8} className="text-white" />
          )}
        </button>
      </div>

      {/* Subtle divider */}
      <div className={`border-t border-bg-border mb-2 transition-all duration-300 ${sidebarExpanded ? 'w-full' : 'w-7'}`} />

      {/* Subject List */}
      <div className={`flex flex-col gap-1.5 w-full transition-all duration-300 ease-in-out ${
        sidebarExpanded ? '-translate-y-1' : 'translate-y-0'
      }`}>
        {subjects.map((subject) => {
          const icon = SUBJECT_ICONS[subject.displayName] ?? (
            <BookOpen size={19} strokeWidth={1.7} className="text-white" />
          );
          const isActive = activeTab === 'books' && selectedSubject?.id === subject.id;

          return (
            <button
              key={subject.id}
              onClick={() => {
                setActiveTab('books');
                navigateToSubject(subject.id);
              }}
              title={subject.displayName}
              className={`relative flex items-center h-10 rounded-xl transition-all duration-150 group ${
                sidebarExpanded ? 'px-3 gap-3 justify-start w-full' : 'justify-center w-10 mx-auto'
              } ${
                isActive
                  ? 'bg-[#1a73e8] text-white font-semibold border border-[#4285f4] shadow-[0_2px_10px_rgba(26,115,232,0.45)]'
                  : 'text-white hover:bg-white/10 border border-transparent'
              }`}
            >
              <span className="text-white shrink-0">
                {icon}
              </span>

              {sidebarExpanded ? (
                <span className="text-sm font-medium text-white truncate text-left">
                  {subject.displayName}
                </span>
              ) : (
                <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 rounded-md bg-bg-surface text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-modal border border-bg-border">
                  {subject.displayName}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

    </aside>
  );
};
