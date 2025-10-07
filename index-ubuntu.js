const { authorize } = require('./auth-ubuntu.js'); 
const {google} = require('googleapis');
const { Client, Events, GatewayIntentBits, CDN, messageLink } = require('discord.js');
const { token } = require('./config.json');
const cron = require('node-cron');

const BOOKINGS_SHEET = '1KN_ykkan4kPSkNlVuTzRcNG1QNgErkrCzacpdesuqxk';
const BOOKINGS_RANGE = 'CCIS Bookings!B2:V';
const SCHEDULE_SHEET = '19S5LniGq1GgKVD_LmXODFGjCJhrisDJNgWIjwgj0gXo';
const SCHEDULE_RANGE = 'API!A:F';
const CHANNEL_ID = '1163553874452418560';
const TEST_ID = '1326260515810443336';
const EXEC_AND_COUNCIL_ID = '1260024607386370140';
const EXEC_ONLY_ID = '1273102651202211921';
const ISSS_GENERAL_ID = '1149533966655827968';

async function getSheetRows(auth, id, range) {
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
  const settingRows = await getSheetRows(auth, SCHEDULE_SHEET, 'README!A10:B');
  const bookingRows = await getSheetRows(auth, BOOKINGS_SHEET, BOOKINGS_RANGE); 
  const scheduleRows = await getSheetRows(auth, SCHEDULE_SHEET, SCHEDULE_RANGE);

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
        bookings.push(`**${row[0]}** has **${row[11]} table(s) and ${row[12]} chair(s)** booked tomorrow from **${parseTime(row[5])} to ${parseTime(row[10])}**`);
        try {
          // GET SCHEDULED AND UNSCHEDULED OFFICE HOURS
          dayIndex = new Date(tomorrow).getDay(); // get column index corresponding to day
          startIndex = parseInt(row[5].slice(0,2)) - 8; // get row index corresponding to pick-up time
          endIndex = parseInt(row[10].slice(0,2)) - 8; // get row index corresponding to drop-off time

          if (startIndex > 1) {
            const cellValuePick = scheduleRows[startIndex-1][dayIndex];
	    if (cellValuePick) {
              cellValuePick.split(', ').forEach(mention => mentions.add(mention.trim()));
	    } else unscheduled.add(parseTime(startIndex + 7));
          }
          
	  const cellValuePick2 = scheduleRows[startIndex][dayIndex];
	  if (cellValuePick2) {
	    cellValuePick2.split(', ').forEach(mention => mentions.add(mention.trim()));
	  } else unscheduled.add(patseTime(startIndex + 8));

	  if (endIndex > 7) endIndex -= 1;
            const cellValueDrop = scheduleRows[startIndex][dayIndex];
            if (cellValueDrop) {
	      cellValueDrop.split(', ').forEach(mention => mentions.add(mention.trim()));
            } else unscheduled.add(parseTime(startIndex + 8))
        } catch (err) {
          console.log("error getting mentions/unscheduled")
        }
      }
    }
  });

  return [settingRows, bookings, mentions, unscheduled];
}

async function pingDiscordBookings() {
  try {
    const [settings, bookings, mentions, unscheduled] = await authorize().then(getBookings).catch(console.error);
    const mentionsArr = Array.from(mentions);
    const unscheduledArr = Array.from(unscheduled);

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    client.once(Events.ClientReady, readyClient => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	
	var channelID;
	settings.forEach((row) => {
	  if (row[0] == "Discord Channel ID:") {
	    channelID = row[1];
	  }
	});
        const channel = client.channels.cache.get(channelID);
        console.log(channelID);
        bookings.forEach((booking) => {
          channel.send(booking);
        })
        
        if (mentionsArr[0]) {
          var mentionStr = ''
          mentions.forEach((mention) => {
            mentionStr += `<@${mention}> `;
          })
          channel.send(`${mentionStr} is/are scheduled for office hours around these times.`)
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

async function getEmails(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  try {
    const res = await gmail.users.messages.list({
      userId: 'torchy@isss.ca',
      labelIds: ['INBOX'], // Only retrieve inbox messages (optional)
    });

    const messages = res.data.messages || []; // Handle empty response gracefully
    var outputs = []
    if (messages.length === 0) {
      console.log('No messages found in inbox.');
      return;
    }

    console.log('Messages:');
    for (const message of messages) {
      // Retrieve details of each message using its ID
      const messageDetails = await gmail.users.messages.get({
        userId: 'torchy@isss.ca',
        id: message.id,
      });
      
      const from = messageDetails.data.payload.headers.find(header => header.name === 'From').value;
      const subject = messageDetails.data.payload.headers.find(header => header.name === 'Subject').value;
      const date = messageDetails.data.payload.headers.find(header => header.name === 'Date').value;
      const unread = messageDetails.data.labelIds.includes("UNREAD")

      const parsedDate = new Date(date)
      const currentDate = new Date()
      const dateDifference = (currentDate - parsedDate) / (1000 * 60 * 60 * 24)
      if (dateDifference > 1) break
      if (unread) {
        var output = {"From": from, "Subject": subject, "Channel": null, "Body": []};
        if (messageDetails.data.payload.parts) {
          // Find the part containing the text content
          const textPart = messageDetails.data.payload.parts.find(part => part.mimeType.startsWith('text/plain'));
          const multiPart = messageDetails.data.payload.parts.find(part => part.mimeType.startsWith('multipart/'));
          // Find image parts
          // const imageParts = messageDetails.data.payload.parts.filter(part => part.mimeType.startsWith('image/'));
          if (textPart) {
            const body = textPart.body.data;
            const decodedBody = Buffer.from(body, 'base64').toString(); // Decode base64-encoded body
	    output["Body"].push(decodedBody);
	  } else {
            console.log('Message body not found or not in plain text format.');
          }
  
          if (multiPart) {
            const textPart2 = multiPart.parts.find((part => part.mimeType.startsWith('text/plain')));
            if (textPart2) {
              const body = textPart2.body.data;
              const decodedBody = Buffer.from(body, 'base64').toString(); // Decode base64-encoded body
	      output["Body"].push(decodedBody);
            } else {
              console.log('Message body not found or not in plain text format.');
            }
          }
  
          // Process image parts (e.g., save to files)
          // for (const imagePart of imageParts) {
          //   const imageData = Buffer.from(imagePart.body.attachmentId, 'base64');
          //   const filename = imagePart.filename || `image_${imagePart.mimeType.split('/')[1]}.${imagePart.mimeType.split('/')[1]}`;
          //   console.log(filename, imageData); // Save image to a file
          // }
          
          for (const body of output["Body"]) {
            const match = body.match(/@torchy\s+([^\s]+)/); // Regular expression to find "@torchy" followed by any non-space characters
            if (match) {
              outputs.push(output)
              const nextWord = match[1]; // The next word after "@torchy"
              if (nextWord == "exec-and-council") {
                output["Channel"] = EXEC_AND_COUNCIL_ID;
              } else if (nextWord == "exec-only") {
                output["Channel"] = EXEC_ONLY_ID;
              } else if (nextWord == "isss-general") {
                output["Channel"] = ISSS_GENERAL_ID;
              } else if (nextWord == "test") {
		output["Channel"] = TEST_ID;
	      }
            }
          }
          

          // Request to remove the UNREAD label
          const request = {
            removeLabelIds: ["UNREAD"],
            addLabelIds: []  // No labels are being added in this case
          };

          // Use the Node.js googleapis library to mark the message as read
          await gmail.users.messages.modify({
            userId: 'me',  // 'me' refers to the authenticated user
            id: message.id,
            requestBody: request
          });
          
          console.log("Message marked as read");
        }
      }
    }
    return outputs
  } catch (error) {
    console.error('Error retrieving emails:', error);
  }
}

async function pingDiscordEmails() {
  try {
    const outputs = await authorize().then(getEmails).catch(console.error);
    function splitMessage(message, maxLength = 2000) {
        const chunks = [];
        while (message.length > maxLength) {
            let chunk = message.slice(0, maxLength);
            const lastNewLine = chunk.lastIndexOf('\n');
            if (lastNewLine > -1) {
                chunk = chunk.slice(0, lastNewLine + 1);
            }
            chunks.push(chunk.trim());
            message = message.slice(chunk.length);
        }
        chunks.push(message.trim());
        return chunks;
    }


    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    client.once(Events.ClientReady, readyClient => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
        
        outputs.forEach((output) => {
          const channel = client.channels.cache.get(output["Channel"]);
          var messageStr = `**From: ${output["From"].split(' ')[0]}**`
          messageStr += `\n**Subject: ${output["Subject"]}**\n`
          output["Body"].forEach((part) => {
            //const modifiedStr = part.replace(/(\w+)\s*<((https?:\/\/[^\s>]+)>)\s*/g, '[$1](<$2>)');
            const modifiedStr = part.replace(/(\w+)(\s*)<((https?:\/\/[^\s>]+)>([^\s]*))/g, '[$1](<$3>)$5');
	    const truncatedStr = modifiedStr.split('@torchy')[0];
	    messageStr += truncatedStr;
        });
          
          try {
	    const chunks = splitMessage(messageStr);
	    for (const chunk of chunks) {
		console.log("CHUNK", chunk)
    		channel.send(chunk); // Replace `channel.send` with your actual send logic
	    }
	    //channel.send(messageStr);
          } catch (err) {
            console.log(err)
          }
        })
      
    });

    client.login(token);

  } catch (err) {
    console.error('Error in pingDiscord:', err);
  }
}

cron.schedule('0 20 * * *', () => {  // Execute at 8pm daily
  console.log('Running daily tabling reminder');
  pingDiscordBookings();
}, {
  timezone: 'America/Denver',
});

// New scheduler that runs every 15 minutes
cron.schedule('*/15 * * * *', () => {
  console.log('Running PingDiscordEmails every 15 minutes');
  pingDiscordEmails();
}, {
  timezone: 'America/Denver',
});
pingDiscordBookings()
//pingDiscordEmails()
