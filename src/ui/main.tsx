import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemberTestPage } from './MemberTestPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemberTestPage />
  </StrictMode>,
);
