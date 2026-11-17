import {
  BookOpen,
  Camera,
  ChefHat,
  ClipboardCheck,
  Clock,
  Coffee,
  Compass,
  Droplets,
  Flag,
  Flame,
  Hand,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  Palette,
  Refrigerator,
  Salad,
  Scale,
  Search,
  ShieldCheck,
  Smartphone,
  Smile,
  Sparkles,
  SprayCan,
  Star,
  Thermometer,
  Timer,
  Trash2,
  Trophy,
  Users,
  Utensils,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ModuleKind } from '@/lib/training'

// Icons an admin can pick for a slide or a step.
export const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  flag: Flag,
  salad: Salad,
  thermometer: Thermometer,
  smile: Smile,
  message: MessageCircle,
  palette: Palette,
  smartphone: Smartphone,
  trophy: Trophy,
  chef: ChefHat,
  utensils: Utensils,
  coffee: Coffee,
  heart: Heart,
  star: Star,
  users: Users,
  pin: MapPin,
  shield: ShieldCheck,
  clock: Clock,
  timer: Timer,
  droplets: Droplets,
  spray: SprayCan,
  hand: Hand,
  scale: Scale,
  fridge: Refrigerator,
  camera: Camera,
  flame: Flame,
  search: Search,
  package: Package,
  trash: Trash2,
  wind: Wind,
  check: ClipboardCheck,
  book: BookOpen,
}

export const KIND_ICON: Record<ModuleKind, LucideIcon> = {
  brand: Sparkles,
  onboarding: Compass,
  recipe: ChefHat,
  sop: ClipboardCheck,
  service: Smile,
  hygiene: ShieldCheck,
  other: BookOpen,
}

// A step without a chosen icon gets one from what it says.
const RULES: [RegExp, string][] = [
  [/temperat|°c|fridge|chill|refrigerat/i, 'thermometer'],
  [/glove|hands?\b|ppe|apron|hair ?net/i, 'hand'],
  [/sanitis|sanitiz|disinfect|chemical|degrease/i, 'spray'],
  [/wash|rinse|water|soak/i, 'droplets'],
  [/weigh|scale|gram|\bkg\b|yield/i, 'scale'],
  [/photo|camera|photograph/i, 'camera'],
  [/\bdry|drying|spinner/i, 'wind'],
  [/cook|boil|heat|induction|griddle|range|hob/i, 'flame'],
  [/stor|label|container|lid/i, 'package'],
  [/minute|\bmin\b|timer/i, 'timer'],
  [/inspect|check|sort|look|walk/i, 'search'],
  [/discard|bin|waste|drain|floor|mop/i, 'trash'],
  [/cut|knife|board|chop|slice/i, 'utensils'],
  [/salt|oil|cup|tsp|spoon/i, 'chef'],
]

export function stepIcon(title: string, body?: string, chosen?: string | null): LucideIcon {
  if (chosen && ICONS[chosen]) return ICONS[chosen]
  const text = `${title} ${body ?? ''}`
  const hit = RULES.find(([re]) => re.test(text))
  return hit ? ICONS[hit[1]] : ClipboardCheck
}

export const BADGE_ICON: Record<string, LucideIcon> = {
  first_pass: Flag,
  first_try: Zap,
  perfect: Star,
  on_time: Timer,
  safety: ShieldCheck,
  all_done: Trophy,
}
