import IconProblem from '~icons/mdi/alert-circle-outline';
import IconFaceId from '~icons/mdi/face-recognition';
import IconHeat from '~icons/mdi/fire';
import IconGas from '~icons/mdi/gas-cylinder';
import IconCoGas from '~icons/mdi/molecule-co';
import IconGarage from '~icons/mdi/garage';
import IconOccupancy from '~icons/mdi/motion-sensor';
import IconTamper from '~icons/mdi/shield-alert-outline';
import IconSmoke from '~icons/mdi/smoke-detector';
import IconCold from '~icons/mdi/snowflake';
import IconVibration from '~icons/mdi/vibrate';
import IconLeak from '~icons/mdi/water-alert-outline';
import IconSensor from '~icons/material-symbols/home-iot-device-outline';
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
import IconLock from '~icons/tabler/lock';
import IconMessage from '~icons/tabler/message';
import IconMoodCry from '~icons/tabler/mood-cry';
import IconPlug from '~icons/tabler/plug';
import IconPuzzle from '~icons/tabler/puzzle';
import IconShieldLock from '~icons/tabler/shield-lock';
import IconSpeakerphone from '~icons/tabler/speakerphone';
import IconTag from '~icons/tabler/tag';
import IconToggleLeft from '~icons/tabler/toggle-left';
import IconUrgent from '~icons/tabler/urgent';
import IconUser from '~icons/tabler/user';
import IconVolume from '~icons/tabler/volume';

const icons: Record<string, Component> = {
  motion: IconActivity,
  person: IconUser,
  vehicle: IconCar,
  animal: IconDog,
  audio: IconVolume,
  sensor: IconSensor,
  alarm_sound: IconUrgent,
  other_sound: IconVolume,
  face: IconFaceId,
  license_plate: IconLicense,
  contact: IconDoor,
  doorbell: IconBellRinging,
  switch: IconToggleLeft,
  light: IconBulb,
  siren: IconSpeakerphone,
  security_system: IconShieldLock,
  'line-crossing': IconArrowsCross,
  smoke: IconSmoke,
  gas: IconGas,
  carbonMonoxide: IconCoGas,
  heat: IconHeat,
  leak: IconLeak,
  cold: IconCold,
  vibration: IconVibration,
  tamper: IconTamper,
  problem: IconProblem,
  occupancy: IconOccupancy,
  power: IconPlug,
  lock: IconLock,
  garage: IconGarage,
  other: IconPuzzle,
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
