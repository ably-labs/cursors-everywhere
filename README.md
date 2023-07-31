# Shared Cursors Everywhere: A Journey into Building a Cross-Browser Plugin

**Introduction**

Recently, I've been having to work a lot with various collaboration tools, such as [Miro](https://miro.com/) and [VS Code Live Share](https://code.visualstudio.com/learn/collaboration/live-share), and it's somewhat warped my expected ease of collaboration when it comes to other things. When on a call with my colleagues, I'll try moving my mouse around on websites we're discussing despite not sharing my screen, or find myself saying 'and when I click here...', realising too late that I'm sharing with naught but the void.

After embarrasing myself one too many times, I decided it was about time I did something about this. How hard could it be to allow for cursors to actually be shared across any website? In my hubris I decided it'd be easy, it's just sharing some positions surely?

(meme)[https://www.google.com/url?sa=i&url=https%3A%2F%2Fxkcd.com%2F927%2F&psig=AOvVaw2cWDmKFcouKyOL-Uss41_8&ust=1690885489005000&source=images&cd=vfe&opi=89978449&ved=0CBAQjRxqFwoTCMCD67jduIADFQAAAAAdAAAAABAE].

If this sounds interesting to you, join me in my adventure, from handling diverse web layouts to dealing with different browser behaviors, not to mention the various performance considerations. This blog post aims to take you through the journey of building this plugin, offering a transparent look into the decisions made and the solutions to the challenges faced. Let's dive in!

**The Making of the Plugin**

***The plan***

The initial step was to define what I'd need to make this Cursors Everywhere concept. As a medium, a Chrome Plugin seemed to make the most sense. It'd be something I could share even with my non-technical colleagues, and should allow for easy access of browser details, such as URL, active tab, and so on. Given that, the programming language of choice defaulted to JavaScript. 

The next question was; how would I go about sharing the cursor positions? 

Making use of a realtime protocol such as WebSockets is a pretty logical way to share, well, real time updates of cursor positions. As I work at Ably, it made sense for me to make use of it as my WebSocket-based pub/sub broker. Using a pub/sub broker can simplify a lot of aspects of a project like this, as they usually come with multiple features built-in that make it quick to get going with projects like this.

For example, in this case I'd want to have the current position of any browser's cursor available at all times to other clients on the page. The easiest way to achieve this would be to have our Pub/Sub broker maintain a set of attributes (aka our positions) associated with each client and its connection. Ably supports this via its [Presence](https://ably.com/docs/presence-occupancy/presence) feature.

***Step 1: Starting with the Basics - Sharing X and Y Coordinates***

So, with a Chrome Plugin with Ably, I felt pretty confident that the work left to me would be pretty minimal. I'd need to add a listener for the cursor, and publish a cursor's position to Ably, to be shared with other clients. Ably's Channels act as a natural delinator between sets of data, so each website's page could be assigned its own unique Ably Channel to hold its cursors positions. Other clients would be listening in to these channels via the Ably Client library, ready to render cursors in the appropriate position.

**Capturing Cursor Movements**

I needed to capture the cursor's movement, which is achieved by attaching an event listener to the `mousemove` event in JavaScript. This event is fired whenever the cursor moves, and it provides us with the X and Y coordinates of the cursor at the time of the event. Here's a snippet of how I did this:

```javascript
document.addEventListener("mousemove", function(event) {
	let x = event.clientX;
	let y = event.clientY;
	// ... rest of the code
});
```

In this code snippet, `event.clientX` and `event.clientY` give us the X and Y coordinates of the cursor respectively.

**Sharing the Coordinates**

Once I had the coordinates, I needed to share them with other users. With the Ably Client library, it's just a matter of connecting to a Channel, and publishing the data as a Presence message, which will update the position associated with the current client:


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

Clients can then listen in to the cursor position to render and update existing cursors by listening in to this Ably Channel.

```javascript

channel.presence.subscribe((presenceMessage) => {
	updateCursors(presenceMessage.clientId, presenceMessage.data.x, presenceMessage.data.y);
});
````

**The Result**

Now for the moment of truth. Was it really that easy?

[onlyPos.mp4]

Unfortunately not. Unsurprisingly, everyone doesn't have the exact same dimensions for their browser, which means that the browser positions of cursors does not map between clients. This approach could work for websites with no adjusting elements, which is incredibly static in its enforced size. For anything more complex however, this is likely to be more misleading than not.

***How it's done professionally: Miro***

It's worth reflecting at this stage on how an app such as Miro achieves accurate representations of cursor positions across their boards. Whilst browsers are incredibly dynamic in capacity, able to completely change their view and arrangement depending on current browser dimensions, what device you're viewing it from, and . Miro instead has a singular canvas, to which everything is mapped. When you zoom in to a Miro board, it won't try to adjust the text to fit in the display, and it won't shuffle around elements to better fit everything on to say a mobile view. The canvas has elements upon it locked rigidly upon it in set positions.

This concept of a 'true' representation of the space allows for everything to be defined far more easily. If a button is always at the same coordinate within the canvas (as opposed to having to deal with the browser's percieved positions of elements), then as long as we communicate the position of a user's cursor on the canvas then we will always perceive the cursor as being on the button.

As lovely as it would be to bring out my magic wand and make it so that all websites can be defined so simply, it is unfortunately just not the case. With dynamically adjusting elements and views, we're going to have to introduce some more complex cursor positioning logic.

***Step 1.1: Interpolating Positions and Batching Messages to Save Bandwidth***

Before getting to that however, I wanted to firstly improve the efficiency of our existing solution. As a browser starts sharing the cursor's X and Y coordinates, the `mousemove` event fires many times per second. This meant that each browser will be sending a large number of messages - a new one for each slight movement of the cursor. Not only does this consume a significant amount of bandwidth, but it could also potentially overwhelm the receiving clients with the volume of updates when you start to have a particlularly busy web page. To address these issues, I decided to introduce two key concepts: position interpolation and message batching.

**Position Interpolation**

Position interpolation is a technique where we create a smooth transition between two points. Instead of sending every single cursor movement, we send fewer points (the start and end of a movement) and interpolate the points in between on the client side. This reduces the number of messages sent while still providing a smooth and accurate representation of the cursor movement.

Here's a simplified version of how this can be implemented from the receiving side:

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

  // Generate coordinates to represent the movement to the new position
	let interpolatedPositions = interpolate(lastPosition[clientId], { x, y });

	interpolatedPositions.forEach((position) => {
		  // Some time delay to ensure it's a smooth movement
    	updatePosition(clientId, position);
	});

	lastPosition[clientId] = { x, y };
});
```

In this code, we keep track of the last cursor position (`lastPosition`). When the cursor moves, we calculate the interpolated positions between the last position and the new position using a helper function (`interpolate`). We then send these interpolated positions instead of the actual positions.


**Message Batching**

Even with position interpolation, clients were still sending a large number of messages. To further reduce the volume, I wanted to introduce message batching. Instead of sending a message for each cursor position, I'd batch multiple positions together and send them as one message.

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

**Insert Image Here:** A diagram showing how position interpolation and message batching work would be helpful here. The diagram could show a series of cursor movements, the points selected for interpolation, and how these points are batched into messages.

***Improving our batching methods with the Spaces SDK***

As you may note from the above code samples, the premise of batching and interpolation are inherently simple. The issue is that in practicality, making efficient batching and interpolation can be quite fiddly. Thankfully, I was made aware that some of my colleagues had been working on a new SDK, called 'Spaces', which was intended to simplify these sorts of commonly required functionalities.

It didn't require too much tinkering to integrate it into the project. It makes use of our existing Ably instance, and just requires us to replace our usage of the presence sets directly to instead make use of the Space's abstraction of it for cursors:

```javascript
const spaces = new Spaces(ably);
space = await spaces.get(url);

// Updating the cursor position
space.cursors.set(position);

// Listening to cursor position changes
space.cursors.subscribe("cursorsUpdate", handleCursorUpdate);
````



***Step 2: Considering the Element the Cursor is Over***

As we refined our cursor sharing approach, we realized that simply sharing X and Y coordinates was not sufficient for a true shared browsing experience. Depending on the browser, device, and individual website design, the same coordinates can point to different elements on different users' screens. To address this, we expanded our plugin to consider not just the coordinates, but also the specific element the cursor is currently hovering over.

**Element Identification**

To achieve this, we needed a way to uniquely identify each element on a webpage. We used the CSS path of the element, a string that describes the element's location in the DOM tree, as this unique identifier. We added a function to our code to get the CSS path of an element:

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

**Including Element in Cursor Position**

We modified our `mousemove` event handler to get the CSS path of the current element and include it in the cursor position data:

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

**Replaying Cursor Movements**

When replaying cursor movements on the client side, we used the CSS path to find the corresponding element and position the cursor relative to that element. If the element was not found (e.g., because the DOM has changed), we fell back to positioning the cursor at the absolute X and Y coordinates.

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

**Insert Image Here:** A diagram showing how the CSS path of an element is determined and used to position the cursor would be useful here. The diagram could show a webpage with a cursor over an element, the CSS path of that element, and how the CSS path is used to find the same element on another user's screen.

***Step 3: Using the New Spaces SDK***

As our plugin grew in complexity, we realized that we needed a more robust solution for handling real-time communication and presence. That's when we discovered Ably's Spaces SDK, a new library designed to facilitate shared experiences in virtual "spaces". This SDK provides a higher level of abstraction over Ably's Realtime Library, and it seemed like the perfect fit for our plugin.

**Incorporating the Spaces SDK**

Integrating the Spaces SDK into our plugin was straightforward. We replaced our usage of the Ably Realtime client with a new `Spaces` object, which we used to create and enter a space corresponding to the current URL:

```javascript
const client = new Ably.Realtime.Promise({
  key: "INSERT_API_KEY",
  clientId: clientId
});

const spaces = new Spaces(client);
let space;
let url = window.location.href;

async function asyncFunc() {
  space = await spaces.get("cursor-position" + url);
  // Other code...
}
asyncFunc();
```

**Sharing Cursor Positions with Spaces**

We used the `set` method provided by the Spaces SDK to share cursor positions:

```javascript
space.cursors.set({
	position: {
  	pageX,
  	pageY,
  	x: xPercent,
  	y: yPercent,
  	time: now - baseTime,
  	element: elementPath
	},
	data: { color: color }
  });
```

**Receiving Cursor Positions with Spaces**

We also replaced our Ably channel subscriptions with subscriptions to the `cursorsUpdate` event provided by Spaces:

```javascript
space.cursors.subscribe("cursorsUpdate", function(cursorUpdate) {
  // Handle cursor update...
});
```

By switching to the Spaces SDK, we gained a number of benefits. The Spaces SDK provides a higher level of abstraction that made our code more concise and easier to understand. The SDK also provides built-in batching of messages, which helped us optimize network usage and performance.

**Insert Image Here:** A flow diagram showing how Spaces SDK works in the context of our plugin would be great. This would illustrate how a cursor position is sent through a space and received by other members of the same space.

With this in place, we had a functioning shared cursors plugin. However, we weren't finished yet. We realized that there were still improvements that could be made, particularly in terms of how websites are structured and how this affects cursor tracking. This led us to the next part of our journey…

***Improving Websites for Cursor Tracking***

With the core functionality of our shared cursors plugin in place, we began to think about the implications for web design and development. We observed that the plugin's accuracy and usefulness could be influenced by how websites are structured and styled. Two key considerations emerged: element identification and element mapping across different views.

**1. Adding Better Identification on Elements**

For the shared cursor to be most useful, it needs to be able to accurately represent not just the cursor's position in terms of x and y coordinates, but also the context in which it is positioned, i.e., which element it is hovering over. To achieve this, we used the CSS path of the element.

However, not all elements on a web page have unique identifiers, and in some cases, the structure of the page could change dynamically, leading to inconsistencies in CSS paths.

To improve this, we suggest web developers to add unique IDs or data attributes to important interactive elements on the page. This allows the plugin to more accurately track the cursor's position relative to these elements, improving the shared experience.

For example:

```html
<button id="submit-button" data-cursor-id="unique-button">Click me!</button>
```

This level of detail could significantly enhance the shared cursor experience, providing more precise and meaningful cursor positions.

**Insert Image Here:** An annotated screenshot showing a web page with interactive elements marked with unique identifiers would be useful here.

**2. Mapping Elements Across Different Views**

Modern websites often have different layouts for desktop and mobile views. Elements that represent the same functionality might be completely different across these views.

For example, a navigation menu could be a horizontal list of links in a desktop view, but a collapsible dropdown menu in a mobile view. This can cause issues with the shared cursor plugin, as the cursor's position over an element in one view might not map accurately to the equivalent element in a different view.

To mitigate this, we propose a system where equivalent elements across different views are tagged with the same unique identifiers. This allows the plugin to accurately map the cursor's position across different views, ensuring a consistent shared experience regardless of the user's device or screen size.

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

With these improvements in web design and development practices, we believe that the shared cursor plugin can provide a more accurate and meaningful shared browsing experience.

**Insert Image Here:** A side-by-side comparison of a website's desktop and mobile views, with equivalent elements highlighted and marked with the same identifiers, would effectively illustrate this concept.

In conclusion, building a shared cursors plugin was an exciting journey that presented interesting challenges and considerations. It demonstrated the power of real-time communication technologies like Ably, and how they can be used to create shared experiences on the web. We believe this is just the beginning, and we're excited to see where this journey takes us next!

**Insert Image Here:** An image of the finished plugin in action, showing shared cursors on a web page, would be a great way to conclude the blog post.
