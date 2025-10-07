const { authorize } = require('./auth-ubuntu.js'); 
const {google} = require('googleapis');
const { Client, Events, GatewayIntentBits, CDN } = require('discord.js');
const { token } = require('./config.json');
const cron = require('node-cron');

const BOOKINGS_SHEET = '1KN_ykkan4kPSkNlVuTzRcNG1QNgErkrCzacpdesuqxk';
const BOOKINGS_RANGE = 'CCIS Bookings!B2:V';
const SCHEDULE_SHEET = '19S5LniGq1GgKVD_LmXODFGjCJhrisDJNgWIjwgj0gXo';
const SCHEDULE_RANGE = 'API!A:F';
const CHANNEL_ID = '1163553874452418560';


async function getRows(auth, id, range) {
  const sheets = google.sheets({version: 'v4', auth});

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: range,
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found');
    return;
  } else {
    return rows;
  }
}

async function getBookings(auth) {
  const bookingRows = await getRows(auth, BOOKINGS_SHEET, BOOKINGS_RANGE); 
  const scheduleRows = await getRows(auth, SCHEDULE_SHEET, SCHEDULE_RANGE);

  const DAY = 24 * 60 * 60 * 1000;
  const tomorrow = new Date().getTime() + DAY - 6 * 60 * 60 * 1000;

  const parseDate = (date) => {
    const [day, month, year] = date.split('/');
    return new Date(year, month-1, day).setHours(0,0,0,0);
  }

  const parseTime = (time) => {
    if (typeof time == 'string') {
      const [hour, minute, second] = time.split(':');
      return `${(hour % 12) || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
    } else {
      return `${(time % 12) || 12}:00 ${time >= 12 ? 'PM' : 'AM'}`;
    }
    
  }

  var bookings = [];
  var mentions = new Set();
  var unscheduled = new Set();
  bookingRows.forEach((row) => {
    if (row[9]) { // if approved column K
      if (parseDate(row[3]) <= tomorrow && tomorrow <= parseDate(row[20]) + DAY) { // if tomorrow lies between the start (column E) and end dates (column V) requested
        bookings.push(`**${row[0]}** has a table booking tomorrow from **${parseTime(row[5])} to ${parseTime(row[10])}**`);
        
        try {
          // GET SCHEDULED AND UNSCHEDULED OFFICE HOURS
          dayIndex = new Date(tomorrow).getDay(); // get column index corresponding to day
          startIndex = parseInt(row[5].slice(0,2)) - 8; // get row index corresponding to pick-up time
          endIndex = parseInt(row[10].slice(0,2)) - 8; // get row index corresponding to drop-off time

          if (startIndex > 1) {
            if (scheduleRows[startIndex-1][dayIndex]) {
              mentions.add(scheduleRows[startIndex-1][dayIndex]); // person scheduled before pick-up time
            } else unscheduled.add(parseTime(startIndex + 7))
          }

          if (scheduleRows[startIndex][dayIndex]) {
            mentions.add(scheduleRows[startIndex][dayIndex]); // person scheduled at pick-up time
          } else unscheduled.add(parseTime(startIndex + 8))

          if (endIndex > 7) endIndex -= 1;
          if (scheduleRows[endIndex][dayIndex]) {
            mentions.add(scheduleRows[endIndex][dayIndex]); // person scheduled at drop-off time
          } else unscheduled.add(parseTime(endIndex + 8))
        } catch (err) {
          console.log("error getting mentions/unscheduled")
        }
      }
    }
  });

  return [bookings, mentions, unscheduled];
}

async function pingDiscord() {
  try {
    const [bookings, mentions, unscheduled] = await authorize().then(getBookings).catch(console.error);
    const mentionsArr = Array.from(mentions);
    const unscheduledArr = Array.from(unscheduled);

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    client.once(Events.ClientReady, readyClient => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
        const channel = client.channels.cache.get(CHANNEL_ID);
        
        bookings.forEach((booking) => {
          channel.send(booking);
        })
        
        if (mentionsArr[0]) {
          var mentionStr = ''
          mentions.forEach((mention) => {
            mentionStr += `<@${mention}> `;
          })
          channel.send(`${mentionStr}are scheduled for office hours around these times.`)
        }
        
        if (unscheduledArr[0]) {
          var unscheduledStr = '';
          for (let i = 0; ; i++) {
            unscheduledStr += unscheduledArr[i];
            if (i + 1 != unscheduledArr.length) unscheduledStr += ', ';
            else break;
          }
          channel.send(`<@&1214930848114286655> No one is scheduled for office hours at ${unscheduledStr}!`)
        }
    });

    client.login(token);

  } catch (err) {
    console.error('Error in pingDiscord:', err);
  }
}

cron.schedule('0 20 * * *', () => {  // Execute at 8pm daily
  console.log('Running daily tabling reminder');
  pingDiscord();
}, {
  timezone: 'America/Denver',
});

// pingDiscord()
