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
    { label: 'Texting registration approved', done: true }
  ],

  autoText: {
    message: "Hi! This is {business}. Sorry we missed your call, we're probably on a job. What can we help you with? Reply here and we'll get right back to you.",
    afterHoursOn: true,
    afterHoursMessage: "Hi! This is {business}. We're closed right now, but we got your call. Tell us what's going on and we'll text you first thing in the morning.",
    notifyOwner: true,
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

  // One conversation per missed call.
  // status: 'waiting'  = customer texted back, shop hasn't answered yet
  //         'replied'  = shop answered, waiting on the customer
  //         'booked'   = turned into a job (value = job price)
  //         'no-reply' = customer never texted back
  conversations: [
    { id: 1, name: 'Maria Gomez', phone: '(555) 014-2290', daysAgo: 0, time: '7:42 AM', status: 'waiting', value: 0,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Hi, my kitchen sink is backing up into the dishwasher. Can someone come today?' }
      ] },
    { id: 2, name: null, phone: '(555) 014-7731', daysAgo: 0, time: '10:15 AM', status: 'no-reply', value: 0,
      messages: [{ from: 'auto', text: '' }] },
    { id: 3, name: 'Derek Hall', phone: '(555) 014-3318', daysAgo: 0, time: '12:03 PM', status: 'waiting', value: 0,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Water heater is making a popping noise. How much for someone to look at it?' }
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
    { id: 9, name: 'Sam Ortiz', phone: '(555) 014-8836', daysAgo: 3, time: '7:51 PM', status: 'waiting', value: 0,
      messages: [
        { from: 'auto', text: '' },
        { from: 'customer', text: 'Low water pressure in the whole house since this morning' }
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
