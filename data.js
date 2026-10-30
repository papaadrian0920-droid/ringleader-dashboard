// Example data for the dashboard.
// Everything here is made up. Later, the server sends real data in this same shape,
// so the dashboard code won't need to change much.

window.RL_DATA = {
  business: {
    name: 'Delgado Plumbing & Heat',
    owner: 'Marco',
    ownerPhone: '(555) 014-0199',     // the shop's real phone; missed calls forward from here
    ringleaderNumber: '(555) 014-0100' // the number we bought; it sends the texts
  },

  setup: [
    { label: 'Ringleader number is active', done: true },
    { label: 'Call forwarding is on and tested', done: true },
    { label: 'Texting registration approved', done: true },
    { label: 'Contact line added (CASL)', done: true }
  ],

  autoText: {
    message: "Hi! This is {business}. Sorry we missed your call, we're probably on a job. What can we help you with? Reply here and we'll get right back to you.",
    afterHoursOn: true,
    afterHoursMessage: "Hi! This is {business}. We're closed right now, but we got your call. Tell us what's going on and we'll text you first thing in the morning.",
    contactLine: "18 Barton St E, Hamilton ON, delgadoplumbing.ca",
    notifyOwner: true,
    intakeOn: true,
    followUpOn: true,
    followUpMessage: "Hi, it's {business} again. Just checking in, do you still need a hand? Reply here anytime.",
    summaryOn: true,
    summaryTime: "7:00 AM"
  },

  hours: [
    { day: 'Mon', open: '7:00 AM', close: '6:00 PM' },
    { day: 'Tue', open: '7:00 AM', close: '6:00 PM' },
    { day: 'Wed', open: '7:00 AM', close: '6:00 PM' },
    { day: 'Thu', open: '7:00 AM', close: '6:00 PM' },
    { day: 'Fri', open: '7:00 AM', close: '6:00 PM' },
    { day: 'Sat', open: '8:00 AM', close: '12:00 PM' },
    { day: 'Sun', open: null, close: null }
  ],

  // What the AI assistant collects from every caller before the owner is texted (the server sends the same list).
  checklist: [
    { key: 'name', label: 'Name' },
    { key: 'problem', label: "What's wrong" },
    { key: 'where', label: 'Where in the home' },
    { key: 'started', label: 'When it started' },
    { key: 'urgent', label: 'How urgent' },
    { key: 'address', label: 'Address' },
    { key: 'property', label: 'Home type' },
    { key: 'free', label: "When they're free" }
  ],

  // One conversation per missed call.
  // status: 'gathering' = the AI is still asking for the job details
  //         'ready'    = the AI got every detail, ready to book
  //         'waiting'  = the customer is waiting on the shop (asked about timing, or texted with the AI off)
  //         'replied'  = shop answered, waiting on the customer
  //         'booked'   = turned into a job (value = job price)
  //         'no-reply' = customer never texted back
  conversations: [
    { id: 1, name: 'Maria Gomez', phone: '(555) 014-2290', daysAgo: 0, time: '7:42 AM', status: 'waiting', value: 0,
      summary: 'Maria Gomez, 22 Locke St S: kitchen sink backing up into the dishwasher, wants someone today',
      details: {
        items: { name: 'Maria Gomez', problem: 'Sink backing up into the dishwasher', where: 'Kitchen', started: 'Last night', urgent: 'Not leaking, but no kitchen sink', address: '22 Locke St S, Hamilton', property: 'House, owns', free: 'not sure' },
        timingAsked: true, done: true
      },
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Hi, my kitchen sink is backing up into the dishwasher. Can someone come today?' },
        { from: 'assistant', text: "Sorry to hear that! Marco will text you about timing. What's your name, and when did it start?" },
        { from: 'customer', text: 'Maria Gomez. Started last night' },
        { from: 'assistant', text: "Thanks Maria. Is any water leaking onto the floor? And what's the address?" },
        { from: 'customer', text: 'No leak, just cant use the sink. 22 Locke St S' },
        { from: 'assistant', text: 'Got it. Is it a house or condo, do you own or rent, and what times usually work for a visit?' },
        { from: 'customer', text: 'House, we own. Not sure what time honestly, depends on work' },
        { from: 'assistant', text: "Perfect, that's everything. Marco will text you shortly about timing." }
      ] },
    { id: 2, name: null, phone: '(555) 014-7731', daysAgo: 0, time: '10:15 AM', status: 'no-reply', value: 0,
      messages: [{ from: 'auto', text: '' }] },
    { id: 3, name: 'Derek Hall', phone: '(555) 014-3318', daysAgo: 0, time: '12:03 PM', status: 'gathering', value: 0,
      summary: 'Derek Hall: water heater popping, asked about price',
      details: {
        items: { name: 'Derek Hall', problem: 'Water heater making a popping noise', where: 'Basement', started: '', urgent: 'No leak', address: '', property: '', free: '' },
        timingAsked: false, done: false
      },
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Water heater is making a popping noise. How much for someone to look at it?' },
        { from: 'assistant', text: "Marco will go over pricing with you directly. Can I get your name, and is anything leaking right now?" },
        { from: 'customer', text: "Derek Hall. No leak, it's in the basement" },
        { from: 'assistant', text: "Thanks Derek. When did the popping start? And what's the address?" }
      ] },
    { id: 4, name: 'Linda Park', phone: '(555) 014-5520', daysAgo: 1, time: '8:20 AM', status: 'booked', value: 1450,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Our water heater is leaking all over the garage floor' },
        { from: 'owner', text: 'Hi Linda, this is Marco. I can be there at 2 today. Does that work?' },
        { from: 'customer', text: 'Yes please!' },
        { from: 'owner', text: "You're booked. See you at 2." }
      ] },
    { id: 5, name: null, phone: '(555) 014-9902', daysAgo: 1, time: '6:48 PM', status: 'no-reply', value: 0,
      messages: [{ from: 'auto', text: '' }] },
    { id: 6, name: 'Tom Reyes', phone: '(555) 014-6604', daysAgo: 2, time: '1:30 PM', status: 'replied', value: 0,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Need a quote to replace two toilets' },
        { from: 'owner', text: 'Hi Tom! Happy to quote that. Are you free Thursday morning?' }
      ] },
    { id: 7, name: 'Angela Brooks', phone: '(555) 014-1187', daysAgo: 3, time: '9:05 AM', status: 'booked', value: 380,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Garbage disposal stopped working' },
        { from: 'owner', text: 'We can come tomorrow between 10 and 12. Work for you?' },
        { from: 'customer', text: 'Perfect' }
      ] },
    { id: 8, name: null, phone: '(555) 014-4410', daysAgo: 3, time: '3:22 PM', status: 'no-reply', value: 0,
      messages: [{ from: 'auto', text: '' }] },
    { id: 9, name: 'Sam Ortiz', phone: '(555) 014-8836', daysAgo: 3, time: '7:51 PM', status: 'ready', value: 0,
      summary: 'Sam Ortiz, 45 Elm St: low water pressure in the whole house, no leak, mornings work',
      details: {
        items: { name: 'Sam Ortiz', problem: 'Low water pressure', where: 'Whole house', started: 'This morning', urgent: 'No leak, can wait', address: '45 Elm St, Hamilton', property: 'House, rents', free: 'Weekday mornings' },
        timingAsked: false, done: true
      },
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Low water pressure in the whole house since this morning' },
        { from: 'assistant', text: "Thanks! What's your name and the address for the job?" },
        { from: 'customer', text: 'Sam Ortiz, 45 Elm St' },
        { from: 'assistant', text: 'Got it. Is anything leaking or flooding right now, or can it wait a day or two?' },
        { from: 'customer', text: 'No leak, just annoying' },
        { from: 'assistant', text: 'Is it a house or condo, and do you own or rent? And what times usually work for a visit?' },
        { from: 'customer', text: 'House, renting. Weekday mornings are best' },
        { from: 'assistant', text: "Perfect, that's everything. Marco will text you shortly to set up a time." }
      ] },
    { id: 10, name: 'Priya Nair', phone: '(555) 014-2075', daysAgo: 4, time: '11:10 AM', status: 'booked', value: 240,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Shower drain is super slow' },
        { from: 'owner', text: 'We can do Friday 8 to 10 AM.' },
        { from: 'customer', text: 'Great, thanks' }
      ] },
    { id: 11, name: null, phone: '(555) 014-6158', daysAgo: 4, time: '5:40 PM', status: 'no-reply', value: 0,
      messages: [{ from: 'auto', text: '' }] },
    { id: 12, name: 'Greg Wilson', phone: '(555) 014-3399', daysAgo: 5, time: '2:14 PM', status: 'booked', value: 1650,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Need a new water heater, the old one is 15 years old' },
        { from: 'owner', text: "We can install Monday. I'll send you a quote tonight." },
        { from: 'customer', text: 'Sounds good' }
      ] },
    { id: 13, name: 'Rosa Jimenez', phone: '(555) 014-7240', daysAgo: 6, time: '8:02 AM', status: 'booked', value: 400,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Toilet keeps running all night' },
        { from: 'owner', text: 'We can swing by this afternoon around 3.' },
        { from: 'customer', text: 'ok thanks' }
      ] },
    { id: 14, name: null, phone: '(555) 014-5013', daysAgo: 6, time: '4:45 PM', status: 'no-reply', value: 0,
      messages: [{ from: 'auto', text: '' }] }
  ]
};
