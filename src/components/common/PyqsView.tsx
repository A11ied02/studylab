import React from 'react';

export const PyqsView: React.FC = () => (
  <section className="flex-1 overflow-hidden bg-white" aria-label="Previous year questions">
    <iframe
      src="https://cbsepyqdirectory.netlify.app/"
      title="CBSE Previous Year Questions Directory"
      className="h-full w-full border-0"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  </section>
);
