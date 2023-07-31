**Cursor Position Sharing: An Adventure in Web Development**

The web is becoming more interactive every day, and as we move towards a more digital society, the need for collaborative tools is increasing. One of these is the ability to share cursor positions across different clients, providing a more collaborative and interactive browsing experience.

For a while, I've been playing around with an open-source plugin I developed called ["Cursors Everywhere"](https://github.com/ably-labs/cursors-everywhere). It's a simple idea: wherever your cursor is on a webpage, it also appears in the same place for anyone else viewing that page. While the concept is simple, the execution is... less so.

**The Original Approach: Absolute Positioning**

My initial approach was to share the cursor's absolute position in pixels. When a user moves their cursor, I sent the X and Y coordinates to other clients using [Ably's](https://www.ably.com/) realtime messaging platform. On receiving the coordinates, the clients would then display a cursor icon at the corresponding position.

Here's a simplified version of the code I used:

```javascript
// Using Ably for realtime messaging
let channel = ably.channels.get("cursor-position");

// Sending cursor position
document.addEventListener("mousemove", function(event) {
    let x = event.clientX;
    let y = event.clientY;
    channel.publish("position", { x, y });
});

// Receiving cursor position
channel.subscribe("position", function(message) {
    let x = message.data.x;
    let y = message.data.y;
    // Display cursor at (x, y)
});
```

This approach worked... technically. However, it had a number of issues. Most importantly, it did not take into account different screen sizes and resolutions. The same absolute coordinates represented different positions on different screens, leading to inconsistent cursor positions across clients.

**Insert Image Here:** An illustration showing how the same absolute cursor position appears differently on screens of different sizes would be helpful here.

**Improving the Original Approach: Relative Positioning**

To address this, I modified the approach to use relative positions instead of absolute positions. I represented the cursor position as a percentage of the total width and height of the page. This provided more consistent cursor positions across different screen sizes.

Here's the updated code:

```javascript
// Sending cursor position
document.addEventListener("mousemove", function(event) {
    let x = event.clientX / window.innerWidth;
    let y = event.clientY / window.innerHeight;
    channel.publish("position", { x, y });
});

// Receiving cursor position
channel.subscribe("position", function(message) {
    let x = message.data.x * window.innerWidth;
    let y = message.data.y * window.innerHeight;
    // Display cursor at (x, y)
});
```

While this was an improvement, it still wasn't perfect. The cursor position was more consistent across different screen sizes, but it was still affected by differences in aspect ratio and page layout. Additionally, the position still didn't account for page scrolling or elements moving around on the page.

**Insert Image Here:** A demonstration showing how relative cursor positioning improves consistency across different screen sizes but still has issues with aspect ratio and page layout.

**Stepping Up the Game: Smooth Transitions and Fewer Messages**

The amount of messages being sent was another major issue. Every time a user moved their cursor, a new message was sent. This led to a large volume of messages, which could slow down the browser and consume a lot of bandwidth.

To reduce the number of messages, I introduced two techniques: position interpolation and message batching.

***Position Interpolation***

Instead of sending a message for every single cursor position, I decided to send messages for a subset of positions and interpolate the rest. This means that instead of sending positions `p1, p2, p3, p4, p5`, I could just send `p1, p3, p5` and calculate `p2` and `p4` as averages of the positions before and after.

Here's a rough example of position interpolation from the publishing side:

```javascript
let lastPosition = {};

document.addEventListener("mousemove", function(event) {
	let clientId = ably.connection.id;
	let x = event.clientX;
	let y = event.clientY;

	// Interpolate the coordinates to represent the movement to the new position
	let interpolatedPositions = interpolate(lastPosition[clientId], { x, y });

	interpolatedPositions.forEach((position) => {
		  // Some time delay to ensure it's a smooth movement
    	updatePosition(clientId, position);
	});

	lastPosition[clientId] = { x, y };
});
```

In this code, we keep track of the last cursor position (`lastPosition`). When the cursor moves, we calculate the interpolated positions between the last position and the new position using a helper function (`interpolate`). We then send these interpolated positions instead of the actual positions.

**Insert Image Here:** A diagram showing how position interpolation and message batching work would be helpful here. The diagram could show a series of cursor movements, the points selected for interpolation, and how these points are batched into messages.

***Message Batching***

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

***Improving Batching Methods with the Spaces SDK***

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

**Step 2: Taking Into Account the Element Under the Cursor**

With the existing solution improved, it was time to address the real issue: accurate cursor position representation. Depending on the browser, device, and individual website

 designs, elements can appear in different places and even take up different amounts of space. Furthermore, we had yet to address the premise of certain elements only existing for certain clients. For example, it's not uncommon for certain elements to appear only on mobile devices, and others on monitors.

**Improving Websites for Cursor Tracking**

With all of the above, I decided I'd need to dig deeper into what exactly I'd want to see in a website to properly allow for accurate cursor positioning being shared. Two key considerations emerged: element identification and element mapping across different views.

***1. Adding Better Identification on Elements***

For the shared cursor to be most useful, it needs to be able to accurately represent not just the cursor's position in terms of x and y coordinates, but also the context in which it is positioned, i.e., which element it is hovering over. To achieve this, we used the CSS path of the element.

However, not all elements on a web page have unique identifiers, and in some cases, the structure of the page could change dynamically, leading to inconsistencies in CSS paths.

To improve this, websites would need to have unique IDs or data attributes for elements that are important for having accurate cursor representation. This allows the plugin to more accurately track the cursor's position relative to these elements, improving the shared experience.

For example:

```html
<button id="submit-button" data-cursor-id="unique-button">Click me!</button>
```

This level of detail could significantly enhance the shared cursor experience, providing more precise and meaningful cursor positions.

**Insert Image Here:** An annotated screenshot showing a web page with interactive elements marked with unique identifiers would be useful here.

***2. Mapping Elements Across Different Views***

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

**Insert Image Here:** A side-by-side comparison of a website's desktop and mobile views, with equivalent elements highlighted and marked with the same identifiers, would effectively illustrate this concept.

With that all done, I was quite happy with the results on this specially designed website. Unfortunately, making this plugin work in a general-purpose way for all existing website was still quite a while away.

**Conclusion**

At the end of this adventure, I'd unfortunately fallen short of designing a solution to work for accurate canvas representation for cursor position sharing across clients. However, I still had a tool now that somewhat worked across web pages, certainly for larger-scale gesturing between clients, such as to point at an image or a block of text.

I hope that sharing this experience might help others when it comes to creating their own interactive elements on their own sites. Although this can be a massive challenge to implement generically across all websites, that's different when it's your own website. When you're in control of how you lay out your website, you have the power to enforce proper identification of elements, and choose where on the site to say make use of a canvas technique that large players in the field such as Miro employ.

I'm expecting to see more and more sites implementing shared interactive elements to their sites as the technologies required for it become cheaper and easier to use. With this change, I anticipate a shift in website design to better accommodate these functionalities. Maybe one day it'll be more viable to make general-purpose tools such as this Cursors Everywhere project. For now, I'll just have to make sure I'm sharing my screen when trying to point at things.

If you're interested in the code for the project as it stands, you can find it on [GitHub](https://github.com/ably-labs/cursors-everywhere).

**Insert Image Here:** An image of the finished plugin in action, showing shared cursors on a web page, would be a great way to conclude the blog post.