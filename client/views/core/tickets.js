/*
 * rrequest
 * http://www.rrequest.com/
 * (C) Copyright Bashton Ltd, 2013
 * 
 * This file is part of rrequest.
 * 
 * rrequest is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * rrequest is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with rrequest.  If not, see <http://www.gnu.org/licenses/>.
 * 
*/
Template.ticketlist.tickets = function () {
  return Tickets.find({}, {sort: {'modified': -1}, limit: ticketsNewest.limit()});
};

Template.tickets.showCreateTicketDialog = function () {
 return Session.get("showCreateTicketDialog");
};

Template.tickets.helpers({
  ticketsReady: function() {
    return ! ticketsNewest.loading();
  },

  allTicketsLoaded: function() {
    return ! ticketsNewest.loading() && Tickets.find().count() < ticketsNewest.loaded();
  }
});

Template.tickets.events({
  'click .new-ticket': function (event) {
    openCreateTicketDialog();
  },

  'click .load-more': function(event) {
    event.preventDefault();
    ticketsNewest.loadNextPage();
  }
});

var openCreateTicketDialog = function () {
  Session.set('currentScroll',$('body').scrollTop());
  Session.set("showCreateTicketDialog", true);
};

Template.createTicketDialog.created = function () {
  Session.set('ticketRequesterSearchTerm', "");
};

Template.createTicketDialog.rendered = function () {
  Session.set('selectedRequesters', []);
  var user = Meteor.users.findOne({_id:Meteor.userId()});
  $(".ticketrequester").select2({
    placeholder: 'Select requesters',
    data: get_requesters,
    multiple: true,
    tokenSeparators: [" "],

    createSearchChoice:function(term, data) {
      if ($(data).filter(function() {
        return this.text.localeCompare(term) === 0;
      }).length === 0) {
        return {id:term, text: term, isNew: true};
      }
    },

    formatResult: function(term) {
      if (term.isNew) {
        return '<span class="label label-important">New</span> ' + term.text;
      } else {
        return term.text;
      }
    }
  });
  if (!user.profile.isStaff) {
    $(".ticketrequester").val([user._id]).trigger("change");
  }


  $(".ticketgroup").select2({
    placeholder: 'Select groups',
    data: get_groups,
    multiple: true
  });

};

get_requesters = function (query_opts) {
  var currentuser = Meteor.users.findOne({_id:Meteor.userId()});
  var users = Meteor.users.find({"profile.isStaff": false});
  var requesters = [];
  if (currentuser.profile.isStaff) {
    users.forEach(function (user) {
      requesters.push({id:user._id, text:user.profile.email});
    });
  } else {
    users.forEach(function (user) {
      if (user._id == currentuser._id) {
        requesters.push({id:user._id, text:user.profile.email, locked: true});
      } else {
        requesters.push({id:user._id, text:user.profile.email});
      }
    });
  }
  return {results: requesters};
};

get_groups = function (query_opts) {
  var user = Meteor.users.findOne({_id:Meteor.userId()});
  var requesters = $(".ticketrequester").select2('val');
  var grouplist = Groups.find({members: {$in: requesters}});
  var groups = [];
  grouplist.forEach(function (group) {
    groups.push({id:group._id, text:group.name});
  });
  return {results: groups};
};

Template.createTicketDialog.events({
  'click .save': function (event, template) {
    var currentuser = Meteor.users.findOne({_id:Meteor.userId()});
    var subject = template.find(".subject").value;
    var requesters = $(".ticketrequester").select2('val');
    var groups = $(".ticketgroup").select2('val');
    
    var existing_users = [];
    var new_users = [];
    requesters.forEach(function (requester){
      var user = Meteor.users.findOne({_id:requester});
      if (user !== undefined) {
        // User already exists in the system
        existing_users.push(user._id);
      } else {
        // User not found, check for valid email address
        var emailMatcher = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        if (emailMatcher.test(requester)) {
          new_users.push(requester);
        }
      }
    });


    Meteor.call('createTicket', {
      subject: subject,
      requesters: existing_users,
      groups: groups,
      status: 'creating'
    }, function (error, ticketId) {
      if (! error) {
        // create new users
        new_users.forEach(function (email_address) {
          Meteor.call('createAutoUser', email_address, function (error, userId) {
            if (!error) {
              // Add user to the ticket
              Meteor.call('addTicketRequester', {
                ticketId: ticketId,
                requesterId: userId
              }, function (error, ticket_id) {

              });
            }
          });
        });

        Meteor.Router.to('/ticket/'+ticketId);
      }
    });
    Session.set("showCreateTicketDialog", false);
  },

  'click .cancel': function () {
    Session.set("showCreateTicketDialog", false);
  }
});

Template.createTicketDialog.ticketRequesters = function () {
  return Meteor.users.find({"profile.isStaff": false});
};

Template.createTicketDialog.ticketRequesterGroups = function () {
  if (Session.get('selectedRequesters') === undefined) {
    Session.set('selectedRequesters', []);
  }
  return Groups.find({members: {$in: Session.get("selectedRequesters")}});
};

Template.ticketlist.helpers({
  requester_email: function (requesterId) {
    var user = Meteor.users.findOne({_id:requesterId});
    if (user !== undefined) {
      return user.profile.email;
    }
  },

  age: function(time){
    return moment(time).fromNow();
  },

  ticketstatus: function(){
    var ticket = Tickets.findOne({_id:this._id});
    if (ticket !== undefined) {
      return ticket.status;
    }
  },

  ticketready: function(){
    var ticket = Tickets.findOne({_id:this._id});
    if (ticket !== undefined) {
      if (ticket.status == 'creating') {
        return false;
      } else {
        return true;
      }
    }
  }
});
