import { inlineSkill, withSkills } from '@tanstack/ai-skills';

import type { ChatMiddleware } from '@tanstack/ai';
import type { InlineSkillConfig } from '@tanstack/ai-skills';

// prettier-ignore
const SKILLS: InlineSkillConfig[] = [
  {
    name: 'alerts-and-watch',
    description: 'Tell the user when something visible happens (text alerts), watch a camera for a limited time, recurring reports on a schedule.',
    instructions: [
      '# Alerts, watch mode and schedules',
      '',
      'For "tell me when <something visible> happens" save a text alert when a text alert tool is available: it watches new events by description.',
      'Write the description in English as a concrete scene ("a delivery worker carrying a parcel at the front door"), the title in the user language.',
      'Threshold 0 means the calibrated gate; give an explicit value between 0.1 and 0.9 only when the user asks for stricter or looser matching.',
      'Build an automation instead only when the wish is about labels, sensors or times (see the automations skill).',
      '',
      'To watch a camera for a while ("keep an eye on the driveway for two hours and tell me when a courier comes") save a text alert with',
      'expiresAt set to the end of that time and replyInChat true. Every hit and a summary at the end then appear in this conversation by',
      'themselves. Tell the user until when you watch. Never poll with snapshots in a loop.',
      '',
      'For recurring reports ("every evening tell me what happened") call save_scheduled_prompt with a cron expression in the user time zone.',
      'list_scheduled_prompt and delete_scheduled_prompt manage existing ones.',
    ].join('\n'),
  },
  {
    name: 'automations',
    description: 'Build or change automations from a wish about labels, sensors or times, or a flow that reacts to an existing alert.',
    instructions: [
      '# Automations',
      '',
      'From a wish like "when someone is at the gate at night, send me a picture" call automation_catalog first, then create_automation with',
      'nodes and edges from the catalog. update_automation changes an existing flow, run_automation starts one by hand.',
      '',
      'To act on an existing text alert ("when the parcel alert fires, switch the light") build trigger-system with category plugin,',
      'eventType plugin:notification and the plugin id, then condition-ifelse on {{system.alertTitle}} or {{system.type}}.',
      '',
      'Every create and update is confirmed by the user in the chat. Do not claim the automation exists before the tool succeeded.',
    ].join('\n'),
  },
  {
    name: 'reports-and-recaps',
    description: 'Recap of a day or several days, highlights with pictures, system health check, any list of labelled numbers.',
    instructions: [
      '# Reports and recaps',
      '',
      'For a recap of a day or a week, a system health check or any list of labelled numbers call show_report once with all items and',
      'add at most one short sentence. Do not repeat the numbers of the card in text. Give a moment its episodeId or eventId from the',
      'tool result, the row then opens it.',
      '',
      'For a recap or highlights over several days work day by day with the episode and summary tools, pick the few moments that matter',
      '(at most five) and order the answer by day. When the user wants pictures, call the event image tool once per picked moment with an',
      'event id from the episode, before you answer.',
      '',
      'You cannot play video. When asked for a clip, fetch the event picture and point the user to the recording in the app.',
    ].join('\n'),
  },
  {
    name: 'clips-and-faces',
    description: 'Deliver a video clip of a moment as download or push, name, ignore or correct faces, find plates, check recording gaps and where activity happens.',
    instructions: [
      '# Clips, faces and recording checks',
      '',
      'For "send me the clip" or "give me the video of that moment" find the event first (query_events, get_episode or search_events_by_text),',
      'then call export_clip with its eventId, or with one camera and a range of at most 5 minutes. The user gets a download button by',
      'itself, never write the downloadUrl or a link into the answer. When they want it on their phone, call send_notification afterwards',
      'with videoUrl set to the downloadUrl of the export.',
      '',
      'Faces: list_unknown_faces shows the strangers with pictures and ids. name_face enrolls one under a name, ignore_faces drops ones the',
      'user never wants to see again, reassign_event_face corrects the name an event shows. Every change is confirmed by the user.',
      '',
      'list_plates lists the license plates read in a range; the events of one plate come from query_events with plates.',
      'activity_profile answers when something happens (hours and weekdays), get_heatmap answers where in the picture. recording_gaps',
      'answers whether a camera recorded through a period and lists the missing stretches.',
    ].join('\n'),
  },
  {
    name: 'media-analysis',
    description: 'Run a detector on a picture, an event or a file the user attached: objects, plates, faces, audio, video, description match.',
    instructions: [
      '# Media analysis',
      '',
      'To find out what a detector sees right now, read the plate on an event or check whether a picture matches a description, call',
      'plugin_capabilities first, then analyze_image with the plugin and method it lists. A CLIP method with a text compares the picture',
      'against that description.',
      '',
      'Files the user attached are listed in the system prompt as upload-1, upload-2 and so on. Analyze them with analyze_image,',
      'analyze_audio or analyze_video through a plugin. Do not claim to have heard audio or watched video yourself.',
    ].join('\n'),
  },
  {
    name: 'browser-control',
    description: 'Act on the page the user is looking at: go back in the timeline, back to live, change the zoom, other page actions.',
    instructions: [
      '# Browser control',
      '',
      'When the user wants something done on the page they are looking at ("go back an hour", "back to live") call ui_actions to see',
      'what that page offers, then ui_action with one of those actions. When nothing fits, say so instead of guessing.',
      '',
      'open_camera, open_recording, open_camview and open_settings navigate the browser. Use them only when the user explicitly asks to',
      'open, show or go to something.',
    ].join('\n'),
  },
];

const SOURCES = SKILLS.map((skill) => inlineSkill(skill));

export function skillsMiddleware(): ChatMiddleware {
  return withSkills(SOURCES);
}
