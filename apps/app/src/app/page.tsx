import { redirect } from 'next/navigation';

/** Home is the Dashboard (app IA: personal action queue is the landing surface). */
export default function Home() {
  redirect('/dashboard');
}
