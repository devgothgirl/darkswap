import { Link } from 'wouter';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { usePageMeta } from '@/lib/seo';

export default function NotFound() {
  usePageMeta({ title: 'Not found', description: 'This page does not exist.', noindex: true });
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <div className="font-mono text-sm text-accent-foreground">404</div>
      <h1 className="mt-3 text-5xl font-extrabold">Nothing out here.</h1>
      <p className="mt-3 text-muted-foreground">This page is not part of DarkSwap Launch.</p>
      <div className="mt-8 flex gap-3">
        <Button asChild><Link href="/">Home</Link></Button>
        <Button asChild variant="outline"><Link href="/explore">Explore</Link></Button>
      </div>
    </div>
  );
}
