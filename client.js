const ss = require('simple-socket-js');
const axios = require('axios');
const FormData = require('form-data');

let serverURL = 'https://photop.exotek.co/';
let assetURL = 'https://photop-content.s3.amazonaws.com/';
const socket = new ss({
    project_id: '61b9724ea70f1912d5e0eb11',
    project_token: 'client_a05cd40e9f0d2b814249f06fbf97fe0f1d5'
});

let activeClient;
let chatListeners = new Map();

async function request(url, method, auth, body, contentType = 'application/json') {
    let raw = {
        method: method,
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
            'Content-Type': contentType
        }
    }
    if (auth) {
        raw.headers["auth"] = auth;
    }
    if (body) {
        raw['data'] = JSON.stringify(body);
    }
    let response = await axios(serverURL + url, raw).catch(err => {
        if (err.response.status == 524) {
            console.log("Client timed out (524)");
        } else {
            console.log("HTTP Error: ", err.response.status, err.response.data)
        }

    });
    if (response) return response.data;
}

class client {
    constructor(auth, callback) {
        if (activeClient) {
            console.log("Already connected to a client");
        } else {
            const promise = new Promise(async (resolve, reject) => {
                let data = await request('me?ss=' + socket.secureID, 'POST', auth).catch(err => reject(err));
                this.me = data;
                this.auth = auth;
                activeClient = this;
                resolve();
            });
            promise.then(callback);
        }
    }
    onPost(callback, groupid) {
        socket.subscribe({
            task: 'general',
            location: 'home'
        }, data => {
            if (data.type == 'newpost') {
                delete data.type;
                callback(new Post(data.post));
            }
        });
    }
    onMention(callback) {
        this.onPost(async post => {
            const postData = await post.connect();
            if (postData.text.includes(`@${this.me.user._id}(${this.me.user.User})`)) {
                callback(post, postData.text.split(' '));
            }
        });
    }
    async getPostById(id) {
        let data = await request('posts/?postid=' + id, 'GET');
        return data.posts[0];
    }
    async getUserById(id) {
        let data = await request('user/?id=' + id, 'GET');
        return new User(data);
    }
    async getUserByName(name) {
        let data = await request('user/?name=' + name, 'GET');
        return new User(data);
    }
    async createPost(text, media = [], groupid = '') {
        let body = new FormData();
        body.append('data', JSON.stringify({
            text: text
        }));
        for (let i = 0; i != Math.min(media.length, 2); i++) {
            body.append("image-" + i, media[i], "image.jpg")
        }
        const response = await axios.post(serverURL + `posts/new${groupid != '' ? `?groupid=${groupid}` : ''}`, body, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${body._boundary}`,
                'auth': this.auth
            }
        }).catch(err => { console.log(err.response.status, err.response.data) });
        return new Post({ _id: await response.data });
    }
    joinGroup(inviteid) {
        request(`groups/join?${code.length == 8 ? 'code' : 'groupid'}=${code}`, 'PUT', activeClient.auth);
    }
    async createGroup(name, privacy = 'member' /*other option is owner*/, image){
        let body = new FormData();
        body.append('data', JSON.stringify({
            name: name,
            invite: privacy
        }));
        if(image){
            body.append("image", image, "image.jpg")
        }
        const response = await axios.post(serverURL + 'groups/new', body, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${body._boundary}`,
                'auth': this.auth
            }
        }).catch(err => { console.log(err.response.status, err.response.data) });
        return new Group({ _id: await response.data });
    }
}

class Post {
    constructor(post) {
        this.post = post;
    }
    async connect() {
        const data = await request('posts/?postid=' + this.post._id, 'GET');
        const postData = data.posts[0];
        let returnData = {
            _id: this.post._id,
            text: postData.Text,
            timestamp: postData.Timestamp,
            media: new Array(),
            author: new User(data.users[0])
        }
        if (postData.Media) {
            for (let i = 0; i < postData.Media.ImageCount; i++) {
                returnData.media.push(`${assetURL}/PostImages/${postData._id}/`);
            }
        }
        return returnData;
    }
    onChat(callback) {
        chatListeners[this.post._id] = callback;
        request(`chats/connect${this.groupid ? `?groupid=${this.groupid}` : ''}`, 'POST', activeClient.auth, {
            ssid: socket.secureID,
            connect: Object.keys(chatListeners)
        });
    }
    onDelete(callback) {
        let query = {
            task: 'post',
            _id: this.post._id
        };
        socket.subscribe(query, data => {
            if (data.type == 'delete') {
                callback(this);
                delete this;
            }
        });
    }
    like() {
        request(`posts/like?postid=${this.post._id}`, 'PUT', activeClient.auth);
    }
    unLike() {
        request(`posts/unlike?postid=${this.post._id}`, 'DELETE', activeClient.auth);
    }
    onLiked(callback) {
        let query = {
            task: 'post',
            _id: this.post._id
        };
        socket.subscribe(query, data => {
            if (data.type == 'like') {
                callback(this);
            }
        });
    }
    async chatting() {
        return await request(`chats/chatting/?postid=${this.post._id}`, 'GET');
    }
    async chat(text, replyID) {
        let body = { text: text };
        if (replyID) {
            body.replyID = replyID;
        }
        const response = await request(`chats/new?postid=${this.post._id}`, 'POST', activeClient.auth, body);
        return new Chat({
            chat: {
                _id: response,
                Text: text,
                Timestamp: Date.now(),
                PostID: this.post._id
            },
            users: [
                activeClient.me.user
            ]

        });
    }
    edit(text) {
        let body = new FormData();
        body.append('data', JSON.stringify({
            text: text
        }));
        axios.post(serverURL + `posts/edit?postid=${this.post._id}`, body, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${body._boundary}`,
                'auth': activeClient.auth
            }
        }).catch(err => { console.log(err.response.status, err.response.data) });
    }
    delete() {
        request(`posts/delete?postid=${this.post._id}`, 'DELETE', activeClient.auth);
    }
    report(reason, text) {
        request(`mod/report?type=post&contentid=${this.post._id}`, 'PUT', activeClient.auth, {
            reason: reason,
            text: text
        });
    }
    pin() {
        request(`posts/pin?postid=${this.post._id}${this.post.groupId ? `&groupid=${this.post.groupId}` : ''}`, 'PUT', activeClient.auth);
    }
    unpin() {
        request(`posts/unpin?postid=${this.post._id}${this.post.groupId ? `&groupid=${this.post.groupId}` : ''}`, 'DELETE', activeClient.auth);
    }
}

class User {
    constructor(user) {
        this._id = user._id;
        this.name = user.User;
        if (user.Settings) {
            if (user.Settings.ProfilePic) {
                this.avatar = `${assetURL}ProfileImages/${user.Settings.ProfilePic}`;
            } else {
                this.avatar = 'https://photop-content.s3.amazonaws.com/ProfileImages/DefaultProfilePic'
            }
            if (user.Settings.ProfileBanner) this.banner = `${assetURL}ProfileBanners/${user.Settings.ProfileBanner}`;
        }

        if (user.ProfileData) {
            this.description = user.ProfileData.Description;
            this.followers = user.ProfileData.Followers;
            this.following = user.ProfileData.Following;
            if (user.ProfileData.Socials) {
                this.socials = user.ProfileData.Socials;
            }
        }

    }
    follow() {
        request(`user/follow?userid=${this._id}`, 'PUT', activeClient.auth);
    }
    unfollow() {
        request(`user/unfollow?userid=${this._id}`, 'DELETE', activeClient.auth);
    }
    block() {
        request(`user/block?userid=${this._id}`, 'PUT', activeClient.auth);
    }
    unblock() {
        request(`user/unblock?userid=${this._id}`, 'PUT', activeClient.auth);
    }
    ban(reason /*Reason = seconds*/, length, terminate) {
        request(`mod/ban?userid=${this._id}`, 'DELETE', activeClient.auth, {
            reason: reason,
            length: length,
            terminate: terminate
        });
    }
    unban() {
        request(`mod/unban?userid=${this._id}`, 'PATCH', activeClient.auth);
    }
    report(reason, text) {
        request(`mod/report?type=user&contentid=${this._id}`, 'PUT', activeClient.auth, {
            reason: reason,
            text: text
        });
    }
    async likes(amount, before, after) {
        return await request(`user/likes?userid=${this._id}${amount ? `&amount=${amount}` : ''}${before ? `&before=${before}` : ''}${after ? `&after=${after}` : ''}`, 'GET');
    }
    kick(group) {

    }
}

class Chat {
    constructor(chat) {
        this._id = chat.chat._id;
        this.postId = chat.chat.PostID;
        this.text = chat.chat.Text;
        this.timestamp = chat.chat.Timestamp;
        this.author = new User(chat.users[0]);
    }
    reply(text) {
        request(`chats/new?postid=${this.postId}`, 'POST', activeClient.auth, { text: text, replyID: this._id });
    }
    delete() {
        request(`chats/delete?chatid=${this._id}`, 'DELETE', activeClient.auth);
    }
    edit(text) {
        request(`chats/edit?chatid=${this._id}`, 'POST', activeClient.auth, { text: text });
    }
    report(reason, text) {
        request(`mod/report?type=chat&contentid=${this._id}`, 'PUT', activeClient.auth, {
            reason: reason,
            text: text
        });
    }
}

class Group {
    constructor(group) {
        this._id = group._id;
    }
    leave() {
        request(`groups/leave?groupid=${this._id}`, 'DELETE', activeClient.auth);
    }
    invite(type, data) {
        request(`groups/invite?groupid=${this._id}`, 'POST', activeClient.auth, {
            type: type,
            data: data
        });
    }
    async members() {

    }
    revoke(invite) {
        request(`groups/revoke?inviteid=${invite}`, 'DELETE', activeClient.auth);
    }
}

socket.remotes.stream = data => {
    if (data.type != 'chat') return;
    const listener = chatListeners[data.chat.PostID];
    if (listener) {
        listener(new Chat(data));
    }
}

exports.client = client;