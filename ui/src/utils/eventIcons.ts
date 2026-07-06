import IconFaceId from '~icons/mdi/face-recognition';
import IconActivity from '~icons/tabler/activity';
import IconAlarm from '~icons/tabler/alarm';
import IconAlertOctagon from '~icons/tabler/alert-octagon';
import IconArrowsCross from '~icons/tabler/arrows-cross';
import IconBabyCarriage from '~icons/tabler/baby-carriage';
import IconBellRinging from '~icons/tabler/bell-ringing';
import IconBulb from '~icons/tabler/bulb';
import IconCar from '~icons/tabler/car';
import IconCarCrash from '~icons/tabler/car-crash';
import IconCat from '~icons/tabler/cat';
import IconDog from '~icons/tabler/dog';
import IconDoor from '~icons/tabler/door';
import IconFlame from '~icons/tabler/flame';
import IconGlassOff from '~icons/tabler/glass-off';
import IconLicense from '~icons/tabler/license';
import IconMessage from '~icons/tabler/message';
import IconMoodCry from '~icons/tabler/mood-cry';
import IconPackage from '~icons/tabler/package';
import IconPuzzle from '~icons/tabler/puzzle';
import IconShieldLock from '~icons/tabler/shield-lock';
import IconSpeakerphone from '~icons/tabler/speakerphone';
import IconTag from '~icons/tabler/tag';
import IconToggleLeft from '~icons/tabler/toggle-left';
import IconUser from '~icons/tabler/user';
import IconVolume from '~icons/tabler/volume';

const icons: Record<string, Component> = {
  // Detection labels
  motion: IconActivity,
  person: IconUser,
  vehicle: IconCar,
  animal: IconDog,
  package: IconPackage,
  audio: IconVolume,
  // Detection attributes
  face: IconFaceId,
  license_plate: IconLicense,
  // Sensor trigger types
  contact: IconDoor,
  doorbell: IconBellRinging,
  switch: IconToggleLeft,
  light: IconBulb,
  siren: IconSpeakerphone,
  security_system: IconShieldLock,
  'line-crossing': IconArrowsCross,
  // Special filter for classifier-produced types
  other: IconPuzzle,
  // Audio labels
  glass_break: IconGlassOff,
  speaking: IconMessage,
  gunshot: IconAlertOctagon,
  dog_bark: IconDog,
  baby_cry: IconBabyCarriage,
  alarm: IconAlarm,
  scream: IconMoodCry,
  cat: IconCat,
  car_alarm: IconCarCrash,
  smoke_alarm: IconFlame,
};

const generic: Component = IconTag;

export function resolveEventIcons(): { icons: Record<string, Component>; generic: Component } {
  return { icons, generic };
}
