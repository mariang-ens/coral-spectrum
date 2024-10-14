/**
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import Vent from '@adobe/vent';
import {events, validate, transform, commons} from '../../../coral-utils';

// Attributes
const DROP_ZONE_ATTRIBUTE = 'coral-dragaction-dropzone';
const HANDLE_ATTRIBUTE = 'coral-dragaction-handle';
const AXIS_ATTRIBUTE = 'coral-dragaction-axis';
const SCROLL_ATTRIBUTE = 'coral-dragaction-scroll';
const CONTAINMENT_ATTRIBUTE = 'coral-dragaction-containment';

// Classes
const OPEN_HAND_CLASS = 'u-coral-openHand';
const CLOSE_HAND_CLASS = 'u-coral-closedHand';
const IS_DRAGGING_CLASS = 'is-dragging';

// Scroll offset default values
const DEFAULT_SCROLL_OFFSET = 20;
const DEFAULT_SCROLL_BY = 10;

/**
 Enumeration for {@link DragAction} axis restrictions.

 @typedef {Object} DragActionAxisEnum

 @property {String} FREE
 Allows vertically and horizontally dragging.
 @property {String} VERTICAL
 Allows vertically dragging only.
 @property {String} HORIZONTAL
 Allows horizontally dragging only.
 */
const axis = {
  FREE: 'free',
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal'
};

/**
 @ignore
 @param {HTMLElement} element
 @returns {HTMLElement}
 First parent element with overflow [hidden|scroll|auto]
 */
function getViewContainer(element) {
  while (element) {
    const p = element.parentNode;

    if (!p) {
      return p;
    }
    if (p.matches('body')) {
      return p;
    }

    const computedStyle = window.getComputedStyle(p);
    const overflow = computedStyle.overflow;

    // IE11 can return a value for overflow even if it was not set compared to other browsers so we check for X and Y.
    const overflowX = computedStyle.overflowX;
    const overflowY = computedStyle.overflowY;

    if ((overflow === 'hidden' || overflow === 'auto' || overflow === 'scroll') &&
      // @polyfill IE11
      overflow === overflowX && overflow === overflowY) {
      return p;
    }

    element = p;
  }
}

/**
 @ignore
 @param {String|HTMLElement|NodeList} el
 @returns {Array.<HTMLElement>}
 X and y position whether event was generated by a click or a touch
 */
function transformToArray(el) {
  if (typeof el === 'string') {
    return Array.prototype.slice.call(document.querySelectorAll(el));
  } else if (el instanceof HTMLElement) {
    return [el];
  } else if (Object.prototype.toString.call(el) === '[object NodeList]') {
    return Array.prototype.slice.call(el);
  }
}

/**
 @ignore
 @param {Object} event
 @returns {Object}
 X and y position whether event was generated by a click or a touch
 */
function getPagePosition(event) {
  let touch = {};

  if (event.changedTouches && event.changedTouches.length > 0) {
    touch = event.changedTouches[0];
  } else if (event.touches && event.touches.length > 0) {
    touch = event.touches[0];
  }

  return {
    x: touch.pageX || event.pageX,
    y: touch.pageY || event.pageY
  };
}

/**
 @ignore
 @param {HTMLElement} scrollingElement
 element that scrolls the document
 @param {HTMLElement} a
 @param {HTMLElement} b
 @returns {Boolean}
 Whether a is within b bounds
 */
function within(scrollingElement, a, b) {
  const aBoundingClientRect = a.getBoundingClientRect();
  const bBoundingClientRect = b.getBoundingClientRect();
  const documentScrollTop = scrollingElement.scrollTop;
  const documentScrollLeft = scrollingElement.scrollLeft;

  const al = aBoundingClientRect.left + documentScrollLeft;
  const ar = al + aBoundingClientRect.width;
  const bl = bBoundingClientRect.left + documentScrollLeft;
  const br = bl + bBoundingClientRect.width;

  const at = aBoundingClientRect.top + documentScrollTop;
  const ab = at + aBoundingClientRect.height;
  const bt = bBoundingClientRect.top + documentScrollTop;
  const bb = bt + bBoundingClientRect.height;

  return !(bl > ar || br < al || (bt > ab || bb < at));
}

/**
 @ignore
 @param {DragAction} dragAction
 Coral.DragAction instance
 @returns {HTMLElement}
 The dropzone that is being hovered by the dragged element or null if none
 */
function isOverDropZone(dragAction) {
  let el = null;
  if (dragAction._dropZones && dragAction._dropZones.length) {
    dragAction._dropZones.some((dropZone) => {
      if (within(dragAction._scrollingElement, dragAction._dragElement, dropZone)) {
        el = dropZone;
        return true;
      }

      return false;
    });
  }

  return el;
}

/**
 @class Coral.DragAction
 @classdesc This a decorator which adds draggable functionality to elements.
 To define draggable actions on specific elements, handles can be used.
 A handle is given a special attribute :
 - <code>coral-dragaction</code> attribute adds draggable functionality to the corresponding element.
 - <code>coral-dragaction-handle</code> attribute allows dragging only by dragging the specified handle.
 - <code>coral-dragaction-dropzone</code> attribute is used to indicate possible dropzones making it possible
 to build drag-and-drop enabled interfaces in conjunction with <code>DragAction</code> events.
 - <code>coral-dragaction-axis</code> and setting it to either <code>horizontal</code> or <code>vertical</code>,
 it is possible to restrict the drag'n'drop to a single axis.
 - <code>coral-dragaction-scroll</code> attribute will scroll the container when the draggable is moved beyond the viewport.
 - <code>coral-dragaction-containment</code>, the draggable element will be constrained to its container.
 @param {String|HTMLElement} dragElement
 The draggable element.
 */
class DragAction {
  /**
   Takes the {HTMLElement} to be dragged as argument.

   @param {HTMLElement} dragElement
   */
  constructor(dragElement) {
    if (!dragElement) {
      throw new Error('Coral.DragAction: dragElement is missing');
    }

    let el = null;
    if (dragElement instanceof HTMLElement) {
      el = dragElement;
    } else if (typeof dragElement === 'string') {
      el = document.querySelector(dragElement);
      if (!el) {
        throw new Error('Coral.DragAction: dragElement is null');
      }
    }

    this._id = commons.getUID();
    this._dragElementValue = dragElement;
    this._dragElement = el;

    // Destroy instance if existing
    if (this._dragElement.dragAction) {
      this._dragElement.dragAction.destroy();
    }

    const computedStyle = window.getComputedStyle(this._dragElement);

    // Store initial position
    this._initialPosition = {
      position: computedStyle.position,
      left: computedStyle.left,
      top: computedStyle.top
    };

    // Prepare Vent
    this._dragEvents = new Vent(this._dragElement);

    // Handle options. Binds events to dragElement if no handles defined or found
    this.handle = this._dragElement.getAttribute(HANDLE_ATTRIBUTE);

    // DropZone options
    this.dropZone = this._dragElement.getAttribute(DROP_ZONE_ATTRIBUTE);

    // Axis horizontal|vertical
    this.axis = this._dragElement.getAttribute(AXIS_ATTRIBUTE);

    // Scroll options
    this.scroll = this._dragElement.matches(`[${SCROLL_ATTRIBUTE}]`);

    // Restriction to container
    this.containment = this._dragElement.matches(`[${CONTAINMENT_ATTRIBUTE}]`);

    this._drag = this._drag.bind(this);
    this._dragEnd = this._dragEnd.bind(this);

    events.on(`touchmove.DragAction${this._id}`, this._drag);
    events.on(`mousemove.DragAction${this._id}`, this._drag);
    events.on(`touchend.DragAction${this._id}`, this._dragEnd);
    events.on(`mouseup.DragAction${this._id}`, this._dragEnd);

    // Store reference on dragElement
    this._dragElement.dragAction = this;
  }

  /**
   The draggable element.

   @name dragElement
   @readonly
   @type {String|HTMLElement}
   @htmlattribute coral-dragaction
   */
  get dragElement() {
    return this._dragElementValue;
  }

  /**
   The handle allowing to drag the element.

   @name handle
   @type {String|HTMLElement}
   @htmlattribute coral-dragaction-handle
   */
  get handle() {
    return this._handle;
  }

  set handle(value) {
    // Set new value
    this._handle = value;

    // Unbind events
    this._dragEvents.off('.DragAction');

    // Remove classes
    document.body.classList.remove(CLOSE_HAND_CLASS);
    this._dragElement.classList.remove(IS_DRAGGING_CLASS);
    if (this._handles && this._handles.length) {
      this._handles.forEach((handle) => {
        handle._dragEvents.off('.DragAction');
        handle.classList.remove(OPEN_HAND_CLASS);
      });
    } else {
      this._dragElement.classList.remove(OPEN_HAND_CLASS);
    }

    if (typeof value === 'string' ||
      value instanceof HTMLElement ||
      Object.prototype.toString.call(value) === '[object NodeList]') {
      this._handles = transformToArray(value);

      // Bind events
      if (this._handles && this._handles.length) {
        this._handles.forEach((handle) => {
          handle._dragEvents = handle._dragEvents || new Vent(handle);
          handle._dragEvents.on('mousedown.DragAction', this._dragStart.bind(this));
          handle._dragEvents.on('touchstart.DragAction', this._dragStart.bind(this));
          handle.classList.add(OPEN_HAND_CLASS);
        });
      } else {
        this._dragEvents.on('touchstart.DragAction', this._dragStart.bind(this));
        this._dragEvents.on('mousedown.DragAction', this._dragStart.bind(this));
        this._dragElement.classList.add(OPEN_HAND_CLASS);
      }
    } else {
      // Defaults to the dragElement
      this._handles = [];
      this._dragEvents.on('touchstart.DragAction', this._dragStart.bind(this));
      this._dragEvents.on('mousedown.DragAction', this._dragStart.bind(this));
      this._dragElement.classList.add(OPEN_HAND_CLASS);
    }
  }

  /**
   The dropZone to drop the dragged element.

   @name dropZone
   @type {String|HTMLElement}
   @htmlattribute coral-dragaction-dropzone
   */
  get dropZone() {
    return this._dropZone;
  }

  set dropZone(value) {
    // Set new value
    this._dropZone = value;
    this._dropZoneEntered = false;

    if (typeof value === 'string' ||
      value instanceof HTMLElement ||
      Object.prototype.toString.call(value) === '[object NodeList]') {
      this._dropZones = transformToArray(value);
    } else {
      this._dropZones = [];
    }
  }

  /**
   The axis to constrain drag movement. See {@link DragActionAxisEnum}.

   @name axis
   @type {String}
   @default DragActionAxisEnum.FREE
   @htmlattribute coral-dragaction-axis
   */
  get axis() {
    return this._axis;
  }

  set axis(value) {
    value = transform.string(value);
    this._axis = validate.enumeration(axis)(value) && value || axis.FREE;
  }

  /**
   Whether to scroll the container when the draggable element is moved beyond the viewport.

   @name scroll
   @default false
   @type {Boolean}
   @htmlattribute coral-dragaction-scroll
   */
  get scroll() {
    return this._scroll;
  }

  set scroll(value) {
    this._scroll = transform.boolean(value);
  }

  /**
   Whether to constrain the draggable element to its container viewport.

   @name containment
   @default false
   @type {Boolean}
   @htmlattribute coral-dragaction-containment
   */
  get containment() {
    return this._containment;
  }

  set containment(value) {
    this._containment = transform.boolean(value);
  }

  /** @private */
  _dragStart(event) {
    // Container
    this._container = getViewContainer(this._dragElement) || document.body;

    // Prevent dragging ghost image
    if (event.target.tagName === 'IMG') {
      event.preventDefault();
    }

    // Prevent touchscreen windows to scroll while dragging
    events.on('touchmove.DragAction', (e) => {
      e.preventDefault();
    });

    document.body._overflow = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    if (!this._container.matches('body')) {
      this._container._overflow = window.getComputedStyle(this._container).overflow;
      this._container.style.overflow = this.scroll ? 'scroll' : 'hidden';
    }

    const pagePosition = getPagePosition(event);
    const dragElementBoundingClientRect = this._dragElement.getBoundingClientRect();
    this._dragPosition = getPagePosition(event);
    this._dragPosition.y -= dragElementBoundingClientRect.top + this._scrollingElement.scrollTop;
    this._dragPosition.x -= dragElementBoundingClientRect.left + this._scrollingElement.scrollLeft;

    // Handle classes
    document.body.classList.add(CLOSE_HAND_CLASS);
    if (this._handles && this._handles.length) {
      this._handles.forEach((handle) => {
        handle.classList.remove(OPEN_HAND_CLASS);
      });
    } else {
      this._dragElement.classList.remove(OPEN_HAND_CLASS);
    }
    this._dragElement.classList.add(IS_DRAGGING_CLASS);

    // Apply relative position by default
    if (window.getComputedStyle(this._dragElement).position === 'static') {
      this._dragElement.style.position = 'relative';
    }

    this._dragEvents.dispatch('coral-dragaction:dragstart', {
      detail: {
        dragElement: this._dragElement,
        pageX: pagePosition.x,
        pageY: pagePosition.y
      }
    });
  }

  /** @private */
  _drag(event) {
    if (this._dragElement.classList.contains(IS_DRAGGING_CLASS)) {
      const pagePosition = getPagePosition(event);

      const documentScrollTop = this._scrollingElement.scrollTop;
      const documentScrollLeft = this._scrollingElement.scrollLeft;

      const dragElementBoundingClientRect = this._dragElement.getBoundingClientRect();
      const dragElementHeight = dragElementBoundingClientRect.height;
      const dragElementWidth = dragElementBoundingClientRect.width;
      const dragElementPosition = {
        top: dragElementBoundingClientRect.top + documentScrollTop,
        left: dragElementBoundingClientRect.left + documentScrollLeft
      };
      const dragElementComputedStyle = window.getComputedStyle(this._dragElement);
      const dragElementCSSPosition = {
        top: parseFloat(dragElementComputedStyle.top) || 0,
        left: parseFloat(dragElementComputedStyle.left) || 0
      };

      const containerBoundingClientRect = this._container.getBoundingClientRect();
      const containerWidth = containerBoundingClientRect.width;
      const containerHeight = containerBoundingClientRect.height;
      const containerPosition = {
        top: containerBoundingClientRect.top + documentScrollTop,
        left: containerBoundingClientRect.left + documentScrollLeft
      };

      this._dragEvents.dispatch('coral-dragaction:drag', {
        detail: {
          dragElement: this._dragElement,
          pageX: pagePosition.x,
          pageY: pagePosition.y
        }
      });

      // Remove selection
      if (document.selection) {
        document.selection.empty();
      } else if (window.getSelection) {
        // @polyfill ie
        if (window.getSelection().removeAllRanges) {
          window.getSelection().removeAllRanges();
        }
      }

      // Need to scroll ?
      if (this.scroll) {
        // Scroll element is the document
        if (this._container === document.body) {
          // Scroll to the top
          if (dragElementBoundingClientRect.top < DEFAULT_SCROLL_OFFSET) {
            this._scrollingElement.scrollTop = documentScrollTop - DEFAULT_SCROLL_BY;
          }
          // Scroll to the bottom but don't go further than the maximum scroll position of the document
          else if (dragElementBoundingClientRect.top + dragElementBoundingClientRect.height > window.innerHeight - DEFAULT_SCROLL_OFFSET &&
            dragElementPosition.top + dragElementBoundingClientRect.height + DEFAULT_SCROLL_OFFSET < this._scrollingElement.scrollHeight) {
            this._scrollingElement.scrollTop = documentScrollTop + DEFAULT_SCROLL_BY;
          }

          // Scroll to the left
          if (dragElementBoundingClientRect.left < DEFAULT_SCROLL_OFFSET) {
            this._scrollingElement.scrollLeft = documentScrollLeft - DEFAULT_SCROLL_BY;
          }
          // Scroll to the right but don't go further than the maximum scroll position of the document
          else if (dragElementBoundingClientRect.left + dragElementBoundingClientRect.width > window.innerWidth - DEFAULT_SCROLL_OFFSET &&
            dragElementPosition.left + dragElementBoundingClientRect.width + DEFAULT_SCROLL_OFFSET < this._scrollingElement.scrollWidth) {
            this._scrollingElement.scrollLeft = documentScrollLeft + DEFAULT_SCROLL_BY;
          }
        }
        // Scroll element is an element other than the document
        else {
          // Scroll to the top
          if (dragElementBoundingClientRect.top - containerBoundingClientRect.top < DEFAULT_SCROLL_OFFSET) {
            this._container.scrollTop = this._container.scrollTop - DEFAULT_SCROLL_BY;
          }
          // Scroll to the bottom but don't go further than the maximum scroll position of the container
          else if (dragElementBoundingClientRect.top - containerBoundingClientRect.top + dragElementBoundingClientRect.height > containerBoundingClientRect.height - DEFAULT_SCROLL_OFFSET &&
            dragElementBoundingClientRect.top - containerBoundingClientRect.top + dragElementBoundingClientRect.height < containerBoundingClientRect.height) {
            this._container.scrollTop = this._container.scrollTop + DEFAULT_SCROLL_BY;
          }

          // Scroll to the left
          if (dragElementBoundingClientRect.left - containerBoundingClientRect.left < DEFAULT_SCROLL_OFFSET) {
            this._container.scrollLeft = this._container.scrollLeft - DEFAULT_SCROLL_BY;
          }
          // Scroll to the bottom but don't go further than the maximum scroll position of the container
          else if (dragElementBoundingClientRect.left - containerBoundingClientRect.left + dragElementBoundingClientRect.width > containerBoundingClientRect.width - DEFAULT_SCROLL_OFFSET &&
            dragElementBoundingClientRect.left - containerBoundingClientRect.left + dragElementBoundingClientRect.width < containerBoundingClientRect.width) {
            this._container.scrollLeft = this._container.scrollLeft + DEFAULT_SCROLL_BY;
          }
        }
      }

      // Set drag element's new position
      const newPosition = {};

      if (this.axis !== 'horizontal') {
        const top = pagePosition.y - this._dragPosition.y;

        // Applying container containment for y movements
        if (this.containment) {
          if (top >= containerPosition.top && top + dragElementHeight <= containerPosition.top + containerHeight) {
            newPosition.top = top;
          }
          // put the drag element to the container's top
          else if (pagePosition.y <= containerPosition.top) {
            newPosition.top = containerPosition.top;
          }
          // put the drag element to the container's bottom
          else if (pagePosition.y >= containerPosition.top + containerHeight) {
            newPosition.top = containerPosition.top + containerHeight - dragElementHeight;
          }
        } else {
          newPosition.top = top;
        }
      }
      if (this.axis !== 'vertical') {
        const left = pagePosition.x - this._dragPosition.x;

        // Applying container containment for x movements
        if (this.containment) {
          if (left >= containerPosition.left && left + dragElementWidth <= containerPosition.left + containerWidth) {
            newPosition.left = left;
          }
          // put the drag element to the container's left
          else if (pagePosition.x <= containerPosition.left) {
            newPosition.left = containerPosition.left;
          }
          // put the drag element to the container's right
          else if (pagePosition.x >= containerPosition.left + containerWidth) {
            newPosition.left = containerPosition.left + containerWidth - dragElementWidth;
          }
        } else {
          newPosition.left = left;
        }
      }

      // Set the new position
      this._dragElement.style.top = `${newPosition.top - dragElementPosition.top + dragElementCSSPosition.top}px`;
      this._dragElement.style.left = `${newPosition.left - dragElementPosition.left + dragElementCSSPosition.left}px`;

      // Trigger dropzone related events
      const dropZone = isOverDropZone(this);
      if (dropZone) {
        this._dropElement = dropZone;
        if (!this._dropZoneEntered) {
          this._dropZoneEntered = true;
          this._dragEvents.dispatch('coral-dragaction:dragenter', {
            detail: {
              dragElement: this._dragElement,
              pageX: pagePosition.x,
              pageY: pagePosition.y,
              dropElement: this._dropElement
            }
          });
        }

        this._dragEvents.dispatch('coral-dragaction:dragover', {
          detail: {
            dragElement: this._dragElement,
            pageX: pagePosition.x,
            pageY: pagePosition.y,
            dropElement: this._dropElement
          }
        });
      } else if (this._dropZoneEntered) {
        this._dragEvents.dispatch('coral-dragaction:dragleave', {
          detail: {
            dragElement: this._dragElement,
            pageX: pagePosition.x,
            pageY: pagePosition.y,
            dropElement: this._dropElement
          }
        });
        this._dropZoneEntered = false;
      }
    }
  }

  /** @private */
  _dragEnd(event) {
    if (this._dragElement.classList.contains(IS_DRAGGING_CLASS)) {
      const pagePosition = getPagePosition(event);

      // Restore overflow
      document.body.style.overflow = document.body._overflow;
      document.body._overflow = undefined;

      if (!this._container.matches('body')) {
        this._container.style.overflow = this._container._overflow;
        this._container._overflow = undefined;
      }

      document.body.classList.remove(CLOSE_HAND_CLASS);
      this._dragElement.classList.remove(IS_DRAGGING_CLASS);

      if (this._handles && this._handles.length) {
        this._handles.forEach((handle) => {
          handle.classList.add(OPEN_HAND_CLASS);
        });
      } else {
        this._dragElement.classList.add(OPEN_HAND_CLASS);
      }

      if (this._dropZoneEntered) {
        const dropZone = isOverDropZone(this);
        if (dropZone) {
          this._dropElement = dropZone;
          this._dragEvents.dispatch('coral-dragaction:drop', {
            detail: {
              dragElement: this._dragElement,
              pageX: pagePosition.x,
              pageY: pagePosition.y,
              dropElement: this._dropElement
            }
          });
        }
      }

      this._dragEvents.dispatch('coral-dragaction:dragend', {
        detail: {
          dragElement: this._dragElement,
          pageX: pagePosition.x,
          pageY: pagePosition.y
        }
      });
    }
  }

  /**
   Remove draggable actions

   @function destroy
   @param {Boolean} restorePosition
   Whether to restore the draggable element to its initial position
   */
  destroy(restorePosition) {
    // Unbind events and remove classes
    document.body.classList.remove(CLOSE_HAND_CLASS);
    this._dragElement.classList.remove(IS_DRAGGING_CLASS);
    if (this._handles && this._handles.length) {
      this._handles.forEach((handle) => {
        handle._dragEvents.off('.DragAction');
        handle.classList.remove(OPEN_HAND_CLASS);
      });
    } else {
      this._dragEvents.off('.DragAction');
      this._dragElement.classList.remove(OPEN_HAND_CLASS);
    }

    events.off(`.DragAction${this._id}`);

    // Restore overflow
    if (document.body._overflow) {
      document.body.style.overflow = document.body._overflow;
      document.body._overflow = undefined;
    }

    // Container might not have been initialized
    if (this._container) {
      if (!this._container.matches('body') && this._container._overflow) {
        this._container.style.overflow = this._container._overflow;
        this._container._overflow = undefined;
      }
    }

    // Set to initial position
    if (restorePosition) {
      this._dragElement.style.position = this._initialPosition.position;
      this._dragElement.style.top = this._initialPosition.top;
      this._dragElement.style.left = this._initialPosition.left;
    }

    // Remove reference
    this._dragElement.dragAction = undefined;
  }

  /**
   Returns {@link DragAction} axis restrictions.

   @return {DragActionAxisEnum}
   */
  static get axis() {
    return axis;
  }

  /** @private */
  get _scrollingElement() {
    // @polyfill ie11
    // Element that scrolls the document.
    return document.scrollingElement || document.documentElement;
  }

  /**
   Triggered when the {@link DragAction#dragElement} starts to be dragged.

   @typedef {CustomEvent} coral-dragaction:dragstart

   @property {HTMLElement} dragElement
   The dragged element
   @property {Number} pageX
   The mouse position relative to the left edge of the document.
   @property {Number} pageY
   The mouse position relative to the top edge of the document.
   */

  /**
   Triggered when the {@link DragAction#dragElement} is being dragged.

   @typedef {CustomEvent} coral-dragaction:drag

   @property {HTMLElement} dragElement
   The dragged element
   @property {Number} pageX
   The mouse position relative to the left edge of the document.
   @property {Number} pageY
   The mouse position relative to the top edge of the document.
   */

  /**
   Triggered when the {@link DragAction#dragElement} stops to be dragged.

   @typedef {CustomEvent} coral-dragaction:dragend

   @property {HTMLElement} dragElement
   The dragged element
   @property {Number} pageX
   The mouse position relative to the left edge of the document.
   @property {Number} pageY
   The mouse position relative to the top edge of the document.
   */

  /**
   Triggered when the {@link DragAction#dragElement} enters a drop element.

   @typedef {CustomEvent} coral-dragaction:dragenter

   @property {HTMLElement} dragElement
   The dragged element
   @property {HTMLElement} dropElement
   The drop element
   @property {Number} pageX
   The mouse position relative to the left edge of the document.
   @property {Number} pageY
   The mouse position relative to the top edge of the document.
   */

  /**
   Triggered when the {@link DragAction#dragElement} is over a drop element.

   @typedef {CustomEvent} coral-dragaction:dragover

   @property {HTMLElement} dragElement
   The dragged element
   @property {HTMLElement} dropElement
   The drop element
   @property {Number} pageX
   The mouse position relative to the left edge of the document.
   @property {Number} pageY
   The mouse position relative to the top edge of the document.
   */

  /**
   Triggered when the {@link DragAction#dragElement} leaves a drop element.

   @typedef {CustomEvent} coral-dragaction:dragleave

   @property {HTMLElement} dragElement
   The dragged element
   @property {HTMLElement} dropElement
   The drop element
   @property {Number} pageX
   The mouse position relative to the left edge of the document.
   @property {Number} pageY
   The mouse position relative to the top edge of the document.
   */

  /**
   Triggered when the {@link DragAction#dragElement} is dropped on a drop element.

   @typedef {CustomEvent} coral-dragaction:drop

   @property {HTMLElement} dragElement
   The dragged element
   @property {HTMLElement} dropElement
   The drop element
   @property {Number} pageX
   The mouse position relative to the left edge of the document.
   @property {Number} pageY
   The mouse position relative to the top edge of the document.
   */
}

export default DragAction;
