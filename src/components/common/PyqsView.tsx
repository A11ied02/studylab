import React from 'react';

export const PYQS_SITE_URL = 'https://cbsepyqdirectory.netlify.app/';

export const PyqsView: React.FC = () => (
  <section className="flex-1 overflow-hidden bg-white" aria-label="Previous year questions">
    <iframe
      src={PYQS_SITE_URL}
      title="CBSE Previous Year Questions Directory"
      className="h-full w-full border-0"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  </section>
);
