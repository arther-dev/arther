import { AppShell, BoxIcon, GridIcon, LocalRail, Skeleton, TagIcon } from '@arther/ui';

/**
 * Specs mode frame (region matrix: rail ✓ · Navigator ✓ tree/list ·
 * Inspector on selection). Rail views per the IA: Products · Component
 * Library · Releases — view switching lands with the Spec Database UI (F6).
 */
export default function SpecsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      rail={
        <LocalRail
          items={[
            { id: 'products', label: 'Products', icon: <BoxIcon />, active: true },
            { id: 'library', label: 'Component Library', icon: <GridIcon /> },
            { id: 'releases', label: 'Releases', icon: <TagIcon /> },
          ]}
        />
      }
      navigator={
        <div aria-busy="true">
          <Skeleton style={{ height: 16, width: '70%', marginBottom: 8 }} />
          <Skeleton style={{ height: 16, width: '55%', marginBottom: 8 }} />
          <Skeleton style={{ height: 16, width: '65%' }} />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
