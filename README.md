
https://github.com/ably-labs/cursors-everywhere/assets/9784119/bd8c1171-8941-4cbe-aaba-34eb6c9c4b42
# Shared Cursors Everywhere: Building a Cross-Browser Plugin

## Introduction

Working with collaboration tools like [Miro](https://miro.com/) and [VS Code Live Share](https://code.visualstudio.com/learn/collaboration/live-share) has transformed my expectations of collaborative interactions. However, I found myself trying to move my cursor around websites during calls with colleagues, despite not sharing my screen. It was as if I believed they could see my cursor. I even caught myself saying, 'and when I click here...', only to realize I was sharing with nothing but the void.

To save myself from further embarrassment, I decided to tackle this issue head-on. I thought, "Why not create a way to share cursors across any website?" The task seemed straightforward: share some positions, right?

![meme](https://www.google.com/url?sa=i&url=https%3A%2F%2Fxkcd.com%2F927%2F&psig=AOvVaw2cWDmKFcouKyOL-Uss41_8&ust=1690885489005000&source=images&cd=vfe&opi=89978449&ved=0CBAQjRxqFwoTCMCD67jduIADFQAAAAAdAAAAABAE).

If you find this intriguing, join me on this adventure of building a cross-browser plugin. This post provides a transparent look into the decisions made and the challenges faced, from handling diverse web layouts to dealing with different browser behaviors and performance considerations. Let's dive in!

## The Making of the Plugin

### The Plan

The first step was defining the requirements for this "Cursors Everywhere" concept. A Chrome Plugin seemed like a logical medium—it's shareable even with my non-technical colleagues and can easily access browser details like URLs and active tabs. Consequently, JavaScript became the language of choice.

The next question was: how to share the cursor positions? 

A realtime protocol like WebSockets seemed like a logical way to share real-time updates of cursor positions. Working at Ably, it was a no-brainer to use it as my WebSocket-based pub/sub broker. A pub/sub broker simplifies many aspects of projects like this, often coming with built-in features that speed up development. For instance, I wanted each browser's cursor position to be continually available to other clients on the page. To achieve this, I could use the [Presence](https://ably.com/docs/presence-occupancy/presence) feature of Ably, which maintains a set of attributes associated with each client and its connection.

### Step 1: Starting with the Basics - Sharing X and Y Coordinates

I began with a Chrome Plugin and Ably, expecting the remaining work to be minimal. My job was to add a listener for the cursor, publish a cursor's position to Ably, and share it with other clients. Ably's Channels could naturally segregate data sets, so each web page could have a unique Ably Channel to hold its cursor positions. Other clients would listen to these channels using the Ably Client library, ready to render cursors in the appropriate position.

#### Capturing Cursor Movements

The first task was capturing cursor movements, achieved by attaching an event listener to the `mousemove` event in JavaScript. This event fires whenever the cursor moves, providing the X and Y coordinates of the cursor at that time. Here's a snippet of how I achieved this:

```javascript
document.addEventListener("mousemove", function(event) {
	let x = event.clientX;
	let y = event.clientY;
	// ... rest of the code
});
```

In this code snippet, `event.clientX` and `event.clientY` provide the X and Y coordinates of the cursor, respectively.

#### Sharing the Coordinates

Once I had the coordinates, I needed to share them with other users. With the Ably Client library, it's as simple as connecting to a Channel and publishing the data as a Presence message, which will update the position associated with the current client:

```javascript
const ably = new Ably.Realtime.Promise({
  key: "ABLY_API_KEY",
  clientId: clientId // Unique client ID to represent the user
});
let channel = ably.channels.get(window.location.href);

document.addEventListener("mousemove", function(event) {
	let x = event.clientX;
	let y = event.clientY;

  channel.presence.update({ x, y });
});
```

Clients can then listen in on the cursor position to render and update existing cursors by subscribing to this Ably Channel.

```javascript
channel.presence.subscribe((presenceMessage) => {
	updateCursors(presenceMessage.clientId, presenceMessage.data.x, presenceMessage.data.y);
});
```

#### The Result

Now for the moment of truth. Was it really that easy?

https://github.com/ably-labs/cursors-everywhere/assets/9784119/2a388f99-28fa-428e-a491-43980f17e32c

Unfortunately, no. The issue was that everyone's browser dimensions varied, meaning the browser positions of cursors did not map between clients. This approach could work for websites with no adjusting elements, which enforced a static size. However, for anything more complex, this would likely be more misleading than useful.

### How Professionals Do It: Miro's Approach

At this stage, it's worth reflecting on how an app like Miro achieves accurate representations of cursor positions across their boards. While browsers are incredibly dynamic, capable of completely changing their view and arrangement depending on the current browser dimensions or the device in use, Miro uses a singular, rigid canvas. When you zoom into a Miro board, it doesn't adjust the text to fit the display or shuffle around elements to fit a mobile view. The canvas has elements locked rigidly upon it in set positions.

This 'true' representation of space allows for everything to be defined more easily. If a button is always at the same coordinate within the canvas, we can accurately perceive the cursor as being on the button, as long as we communicate the position of a user's cursor on the canvas.

As ideal as it would be to enforce this simple definition across all websites, that's not feasible. With dynamically adjusting elements and views, we had to introduce more complex cursor positioning logic.

## Step 1.1: Position Interpolation and Message Batching for Bandwidth Efficiency

Before tackling the above issue, I wanted to improve the efficiency of our existing solution. As a browser starts sharing the cursor's X and Y coordinates, the `mousemove` event fires many times per second. This means that each browser sends a large number of messages—a new one for each slight movement of the cursor. This consumes significant bandwidth and could potentially overwhelm the receiving clients with the volume of updates, particularly on busy web pages. To address these issues, I introduced two key concepts: position interpolation and message batching.

### Position Interpolation

Position interpolation is a technique where we create a smooth transition between two points. Instead of sending every single cursor movement, we send fewer points (the start and end of a movement) and interpolate the points in between on the client side. This reduces the number of messages sent while still providing a smooth and accurate representation of the cursor movement.

Here's a simplified version of how this can be implemented on the receiving side:

```javascript
let lastPosition = [];

channel.presence.subscribe((msg) => {
	let clientId = msg.clientId;
	let x = msg.data.x;
	let y = msg.data.y;

	if (!lastPosition[clientId]) {
    	lastPosition[clientId] = { x, y };
    	return;
	}

  // Generate

 coordinates to represent the movement to the new position
	let interpolatedPositions = interpolate(lastPosition[clientId], { x, y });

	interpolatedPositions.forEach((position) => {
		  // Some time delay to ensure it's a smooth movement
    	updatePosition(clientId, position);
	});

	lastPosition[clientId] = { x, y };
});
```

In this code, we keep track of the last cursor position (`lastPosition`). When the cursor moves, we calculate the interpolated positions between the last position and the new position using a helper function (`interpolate`). We then send these interpolated positions instead of the actual positions.

### Message Batching

Even with position interpolation, clients were still sending a large number of messages. To further reduce the volume, I decided to introduce message batching. Instead of sending a message for each cursor position, I batched multiple positions together and sent them as one message.

Here's a rough example of message batching from the publishing side:

```javascript
let batch = [];

document.addEventListener("mousemove", function(event) {
	let x = event.clientX;
	let y = event.clientY;

	batch = batch.concat({ x, y });

	if (batch.length >= BATCH_SIZE) {
    	channel.presence.update(batch);
    	batch = [];
	}
});
```

In this code, we maintain a batch of cursor positions (`batch`). When the batch reaches a certain size (`BATCH_SIZE`), we send the entire batch at once using `channel.presence.update`.

By introducing position interpolation and message batching, we significantly reduced the number of messages sent, saving bandwidth and improving the performance of our plugin. These techniques, while adding a bit of complexity, were key to making the plugin practical for real-world use.

### Improving Batching Methods with the Spaces SDK

As you might notice from the above code samples, the premise of batching and interpolation is inherently simple. However, efficiently implementing these methods in practice can be quite challenging. Luckily, some of my colleagues had been working on a new SDK called 'Spaces', designed to simplify these types of functionalities.

Integrating it into the project didn't require much tinkering. It makes use of our existing Ably instance and requires us to replace our usage of the presence sets directly with the Space's abstraction of it for cursors:

```javascript
const spaces = new Spaces(ably);
space = await spaces.get(url);

// Updating the cursor position
space.cursors.set(position);

// Listening to cursor position changes
space.cursors.subscribe("cursorsUpdate", handleCursorUpdate);
```

The Spaces SDK handles the publishing of data, automatically batching cursor updates if the number of messages per second becomes too high.

## Step 2: Taking Into Account the Element Under the Cursor

With the existing solution improved it was time to address the real issue: accurate cursor position representation. Depending on the browser, device, and individual website design, the same coordinates can point to different elements on different users' screens.

After some thought, it dawned on me that the goal was usually to point at some form of **element** on the page, be it a button, a text box, or something else. Perhaps combining element identifiers and positions would bring us a step closer to accurately representing cursor position.

### Element Identification

Ideally, each element would have a unique `id`, allowing us to communicate said id and call it a day. Unfortunately, many websites do not assign ids to all elements. To achieve my goal, I needed a way to uniquely identify each element on a webpage. Eventually, I decided to use the CSS path of the element, a string that describes the element's location in the DOM tree. If an element has an id, we've uniquely identified it already. If not, we can attempt to uniquely identify it by this path.

```javascript
function getCSSPath(element) {
	let path = [];
	while (element.nodeType === Node.ELEMENT_NODE) {
    	let selector = element.nodeName.toLowerCase();
    	if (element.id) {
        	selector += "#" + element.id;
    	} else {
        	let sibling = element;
        	let siblingSelectors = [];
        	while (sibling !== null && sibling.nodeType === Node.ELEMENT_NODE) {
            	siblingSelectors.unshift(sibling.nodeName.toLowerCase());
            	sibling = sibling.previousSibling;
        	}
        	if (siblingSelectors.length > 0) {
            	selector += ":nth-child(" + siblingSelectors.length + ")";
        	}
    	}
    	path.unshift(selector);
    	element = element.parentNode;
	}
	return path.join(" > ");
}
```

This function traverses up the DOM tree from the given element, building a string that uniquely identifies the element.

### Including Element in Cursor Position

I then modified the `mousemove` event handler to get the CSS path of the current element and include it in the cursor position data:

```javascript
document.addEventListener("mousemove", function(event) {
	let x = event.clientX;
	let y = event.clientY;
	let elements = document.elementsFromPoint(x, y);
	let element = elements[0];
	let elementPath = getCSSPath(element);

	// Other code...

	let cursorPosition = {
    	x,
    	y,
    	element: elementPath
	};

	// Other code...
});
```

### Replaying Cursor Movements

When replaying cursor movements on the client side, we used the CSS path to find the corresponding element and position the cursor relative to that element. If the element was not found (e.g., because the DOM has changed), it can fall back to positioning the cursor at the absolute X and Y coordinates.

```javascript
space.cursors.subscribe("cursorsUpdate", function(cursorUpdate) {
	let position = cursorUpdate.position;
	let element = document.querySelector(position.element);
	if (element) {
    	// Position cursor relative to the element...
	} else {
    	// Position cursor at absolute coordinates...
	}
});
```

By considering the element under the cursor, we improved the accuracy of cursor sharing and made the shared browsing experience more consistent across different browsers and devices.

https://github.com/ably-labs/cursors-everywhere/assets/9784119/aa104a04-a171-45db-9988-79b985fa999a

### Still Not Quite There...

Although we now have better cursor positioning than before, we still have issues. Although we can sometimes represent the element we want to highlight with the CSS path, it's not something we can rely on. As seen in the above gif, the cursor will jump to quite differing locations as the solution swaps between element positioning and just using the x and y coordinates.

Additionally, within elements themselves, it doesn't work well if they themselves can change form. For example, a common use-case I'd expect from this plugin would be to indicate a word in a paragraph of text. Unless we have specific spans or ids on each letter, we'll just be using the element as the entire paragraph's element. This means that as a display scales up/down, the text will wrap around, and result in the specific coordinates within our paragraph element for a word or letter varying from client to client.

This isn't to mention the premise of certain elements only existing for certain clients. For example, it's not irregular to have certain elements appear only on mobile devices, and others on monitors.

## Improving Websites for Cursor Tracking

With all of the above, I decided I'd need to dig deeper into what exactly I'd want to see in a website to properly allow for accurate cursor positioning being shared. Two key considerations emerged: element identification and element mapping across different views.

### 1. Adding Better Identification on Elements

For the shared cursor to be most useful, it needs to be able to accurately represent not just the cursor's position in terms of x and y coordinates, but also the context in which it is positioned, i.e., which element it is hovering over. To achieve this, we used the CSS path of the element.

However, not all elements on a web page have unique identifiers, and in some cases, the structure of the page could change dynamically, leading to inconsistencies in CSS paths.

To improve this, websites would need to have unique IDs or data attributes for elements that are important for having accurate cursor representation. This allows the plugin to more accurately track the cursor's position relative to these elements, improving the shared experience.

For example:

```html
<button id="submit-button" data-cursor-id="unique-button">Click me!</button>
```

This level of detail could significantly enhance the shared cursor experience, providing more precise and meaningful cursor positions.

### 2. Mapping Elements Across Different Views

Modern websites often have different layouts for desktop and mobile views. Elements that represent the same functionality might be completely different across these views.

For example, a navigation menu could be a horizontal list of links in a desktop view, but a collapsible dropdown menu in a mobile view. This can cause issues with the shared cursor plugin, as the cursor's position over an element in one view might not map accurately to the equivalent element in a different view.

To mitigate this, a system where equivalent elements across different views are tagged with the same unique identifiers. This allows the plugin to accurately map the cursor's position across different views, ensuring a consistent shared experience regardless of the user's device or screen size.

```html
<!-- Desktop view -->
<nav id="desktop-nav" data-cursor-id="main-nav">
  <!-- Navigation links -->
</nav>

<!-- Mobile view -->
<div id="mobile-nav" data-cursor-id="main-nav">
  <!-- Navigation links -->
</div>
```

With these considerations in mind, I created an incredibly simple React app, to test out these concepts and see how well the cursor positioning worked. The site I made had two view types, mobile and browser, with each element having unique identifiers. I even set it up to have each letter have its own unique identifier, which made me slightly queezy:

```javascript
import React from 'react';

export default function DesktopView() {
  const lines = [
    { id: 'line-1', text: 'This is the first line of text blablablablablablablablabla.' },
    { id: 'line-2', text: 'This is the second line of text blablablablablablablablabla.' },
    { id: 'line-3', text: 'This is the third line of text blablablablablablablablabla.' }
  ];

  return (
    <div className="desktop-view">
      {lines.map((line) => (
        <p key={line.id} id={line.id}>
          {line.text.split('').map((character, index) => (
            <span key={index} id={`${line.id}_${index}`}>
              {character}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
```
https://github.com/ably-labs/cursors-everywhere/assets/9784119/a0fec63f-7b13-4453-a21d-dca86f8c9489

With that all done, I was quite happy with the results of this specially designed website. Unfortunately, making this plugin work in a general-purpose way for all existing website was still quite a while away.

## Conclusion

At the end of this adventure, I'd unfortunately fallen short of designing a solution to work for accurate canvas representation for cursor position sharing across clients. However, I still had a tool now that somewhat worked across web pages, certainly for larger-scale gesturing between clients, such as to point at an image or a block of text.

I hope that sharing this experience might help others when it comes to creating their own interactive elements on their own sites. Although this can be a massive challenge to implement generically across all websites, that's different when it's your own website. When you're in control of how you lay out your website, you have the power to enforce proper identification of elements, and choose where on the site to say make use of a canvas technique that large players in the field such as Miro employ.

I'm expecting to see more and more sites implementing shared interactive elements to their sites as the technologies required for it become cheaper and easier to use. With this change, I anticipate a shift in website design to better accomodate these functionalities. Maybe one day it'll be more viable to make general-purpose tools such as this Cursors Everywhere project. For now, I'll just have to make sure I'm sharing my screen when trying to point at things.

If you're interested in the code for the project as it stands, you can find it on [GitHub](https://github.com/ably-labs/cursors-everywhere).
