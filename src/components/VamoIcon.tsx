
import {
  AlertCircle,
  LayoutDashboard,
  User,
  Users,
  Car,
  ShieldCheck,
  CheckCircle,
  Search,
  DollarSign,
  Wallet,
  CalendarClock,
  ChevronRight,
  LogOut,
  Star,
  Award,
  Mail,
  Phone,
  FileText,
  Shield,
  Bot,
  Target,
  Percent,
  XCircle,
  Loader,
  CircleAlert,
  MapPin,
  Flag,
  Route,
  Clock,
  Map,
  UserCheck,
  CreditCard,
  Info,
  Play,
  Hourglass,
  CircleDashed,
  ShieldAlert,
} from "lucide-react";

const icons = {
  "alert-circle": AlertCircle,
  "layout-dashboard": LayoutDashboard,
  user: User,
  users: Users,
  car: Car,
  "shield-check": ShieldCheck,
  "check-circle": CheckCircle,
  search: Search,
  "dollar-sign": DollarSign,
  wallet: Wallet,
  "calendar-clock": CalendarClock,
  "chevron-right": ChevronRight,
  logout: LogOut,
  star: Star,
  award: Award,
  mail: Mail,
  phone: Phone,
  "file-text": FileText,
  shield: Shield,
  bot: Bot,
  target: Target,
  percent: Percent,
  "x-circle": XCircle,
  loader: Loader,
  "circle-alert": CircleAlert,
  "map-pin": MapPin,
  flag: Flag,
  route: Route,
  clock: Clock,
  map: Map,
  "user-check": UserCheck,
  "credit-card": CreditCard,
  info: Info,
  play: Play,
  hourglass: Hourglass,
  "circle-dashed": CircleDashed,
  "shield-alert": ShieldAlert,
  check: CheckCircle, // Alias para Check
};

export type VamoIconName = keyof typeof icons;

export function VamoIcon({
  name,
  className,
}: {
  name: VamoIconName;
  className?: string;
}) {
  const Icon = icons[name];
  if (!Icon) {
    // Fallback o manejo de error si el ícono no se encuentra
    return null;
  }
  return <Icon className={className} />;
}

// Para mantener compatibilidad con algunos usos que puedan quedar
export const WhatsAppLogo = () => (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 fill-current"
    >
      <title>WhatsApp</title>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
    </svg>
  );
