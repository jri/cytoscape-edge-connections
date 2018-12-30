let events = false    // tracks event handler registration ### TODO: drop it

function register (cytoscape) {
  // TODO: can this happen? Drop it?
  if (!cytoscape) {
    console.warn('Can\'t register cytoscape-edge-connections; Cytoscape not available')
    return
  }
  // register extensions
  cytoscape('core', 'addEdge', addEdge)
  cytoscape('core', 'addEdges', addEdges)
  cytoscape('collection', 'auxNode', auxNode)
  cytoscape('collection', 'isAuxNode', isAuxNode)
  cytoscape('collection', 'edgeId', edgeId)
};

// expose to global cytoscape (i.e. window.cytoscape)
if (typeof cytoscape !== 'undefined') {
  register(cytoscape)
}

module.exports = register

/**
 * @param   assoc     dm5.ViewAssoc
 */
function addEdge (assoc) {
  eventHandlers(this)   // TODO: move to "init" call
  if (!_addEdge(this, assoc)) {
    throw Error(`edge can't be added to graph as a player does not exist ${JSON.stringify(assoc)}`)
  }
}

/**
 * @param   assocs    array of dm5.ViewAssoc
 */
function addEdges (assocs) {
  eventHandlers(this)   // TODO: move to "init" call
  let rounds = 0
  do {
    assocs = assocs.filter(assoc => !_addEdge(this, assoc))
    rounds++
  } while (assocs.length)
  console.log(`${rounds} add-edges rounds`)
}

/**
 * @param   assoc   dm5.ViewAssoc
 */
function _addEdge (cy, assoc) {
  const id1 = nodeId(cy, assoc.role1)
  const id2 = nodeId(cy, assoc.role2)
  if (id1 !== undefined && id2 !== undefined) {
    const edge = cy.add(cyEdge(assoc, id1, id2))
    createAuxNode(cy, edge)
    return true
  }
}

/**
 * Creates and adds aux node to represent the given edge.
 */
function createAuxNode (cy, edge) {
  const p1 = edge.source().position()
  const p2 = edge.target().position()
  const auxNode = cy.add({
    // Note: the aux node ID is generated by Cytoscape (string). IDs of aux nodes are not relevant to the renderer.
    // The renderer recognizes an aux node by having "assocId" data.
    data: {
      assocId: eleId(edge),               // holds original edge ID. Needed by context menu. ### TODO: rename "edgeId"
      color: edge.data('color')
    },
    position: {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    }
  })
  edge.data('auxNodeId', auxNode.id())    // set back link; auxNodeId is of type string
}

function eventHandlers (cy) {
  if (!events) {
    // Note: for edge connecting edges aux node position changes must cascade.
    // So the position event selector must capture both aux nodes and regular nodes.
    // FIXME: also the edge handler node is captured, but should not be a problem.
    cy.on('position', 'node', e => repositionAuxNodes(e.target))
    cy.on('remove', 'edge[color]', e => removeAuxNode(e.target))    // remove aux node when removing edge
    events = true
  }
}

function repositionAuxNodes (node) {
  node.connectedEdges('edge[color]').forEach(edge => {
    const midpoint = edge.midpoint()
    // Note: if Cytoscape can't draw the edge (a warning appears in the browser console) its midpoint is undefined
    // (x and y are NaN). If a node is positioned to such an invalid position its canvas representation becomes corrupt
    // (drawImage() throws "InvalidStateError: The object is in an invalid state" then).
    if (isValidPos(midpoint)) {
      edge.auxNode().position(midpoint)
    }
  })
}

function removeAuxNode (edge) {
  edge.auxNode().remove()
}

/**
 * Builds a Cytoscape edge from a dm5.ViewAssoc
 *
 * Prerequisite: viewAssoc has 2 topic players specified by-ID. ### FIXDOC
 *
 * @param   viewAssoc   A dm5.ViewAssoc
 */
function cyEdge (viewAssoc, id1, id2) {
  return {
    data: {
      id:      viewAssoc.id,
      typeUri: viewAssoc.typeUri,   // TODO: needed?
      label:   viewAssoc.value,
      color:   viewAssoc.getColor(),
      source:  id1,
      target:  id2,
      viewAssoc
    }
  }
}

/**
 * @return    the ID of the node that represents the given player. For a topic player that is the topic ID (number);
 *            for an assoc player that is the ID of the assoc's aux node (string). If the assoc is not (yet) in the
 *            graph `undefined` is returned.
 */
function nodeId (cy, player) {
  const playerId = player.id
  if (player.isTopicPlayer()) {
    return playerId
  }
  const edge = cy.getElementById(playerId.toString())
  if (edge.size() === 1) {
    return auxNodeId(edge)
  }
}

/**
 * Prerequisite: "this" refers to an edge.
 *
 * @return  the aux node (a one-element Cytoscape collection) that represents the given edge.
 */
function auxNode () {
  const edge = this
  if (!edge || !edge.isEdge()) {
    throw Error(`auxNode() is expected to be called on an edge, but called on ${JSON.stringify(edge)}`)
  }
  const auxNode = edge.cy().getElementById(auxNodeId(edge))
  if (auxNode.size() !== 1) {
    throw Error(`no aux node for edge ${edge.id()}`)
  }
  return auxNode
}

/**
 * @return  the ID (string) of the aux node of the given edge.
 */
function auxNodeId (edge) {
  const auxNodeId = edge.data('auxNodeId')
  if (!auxNodeId) {
    throw Error(`edge ${edge.id()} has no "auxNodeId" data`)
  }
  return auxNodeId
}

/**
 * Prerequisite: "this" refers to a node.
 *
 * @return  true if the node is an aux node, false otherwise.
 */
function isAuxNode () {
  return this.edgeId() !== undefined
}

/**
 * Prerequisite: "this" refers to a node.
 *
 * @return  the ID of the edge represented by this aux node.
 *          Returns `undefined` if this is not an aux node (TODO: throw instead?).
 */
function edgeId () {
  const node = this
  if (!node || !node.isNode()) {
    throw Error(`edgeId() is expected to be called on a node, but called on ${JSON.stringify(node)}`)
  }
  return node.data('assocId')
}

function eleId (ele) {
  // Note: Cytoscape element IDs are strings
  return Number(ele.id())
}

function isValidPos(pos) {
  // Global isNan() coerces to number and then checks; Number.isNaN() checks immediately.
  return !(Number.isNaN(pos.x) || Number.isNaN(pos.y))
}
