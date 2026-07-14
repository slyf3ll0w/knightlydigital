import { redirect } from 'next/navigation';

// Marketing services were retired in favor of custom web design.
export default function DigitalMarketingPage() {
  redirect('/custom-web-design');
}
