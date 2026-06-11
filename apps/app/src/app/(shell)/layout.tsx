import { ShellTopBar } from '../../components/ShellTopBar';

/**
 * The shell frame: persistent top bar + the mode's region layout below
 * (Handoff 02 §1). Only the content area inside each mode scrolls.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-app">
      <ShellTopBar />
      {children}
    </div>
  );
}
