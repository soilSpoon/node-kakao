/*
 * Created on Fri Jan 22 2021
 *
 * Copyright (c) storycraft. Licensed under the MIT Licence.
 */

import { Long } from "bson";
import { Channel, OpenChannel } from "../../channel/channel";
import { ChannelInfo, OpenChannelInfo } from "../../channel/channel-info";
import { ChannelManageSession, ChannelSession, ChannelTemplate, OpenChannelSession } from "../../channel/channel-session";
import { Chat, ChatLogged } from "../../chat/chat";
import { KnownChatType } from "../../chat/chat-type";
import { CommandSession } from "../../network/request-session";
import { DefaultReq } from "../../packet/bson-data-codec";
import { KnownDataStatusCode } from "../../packet/status-code";
import { CommandResult } from "../../request/command-result";
import { createIdGen } from "../../util/id-generator";


/**
 * Default ChannelSession implementation
 */
export class TalkChannelSession implements ChannelSession {

    private _channel: Channel;
    private _session: CommandSession;

    private _idGenerator: Generator<number>;

    constructor(channel: Channel, session: CommandSession) {
        this._channel = channel;
        this._session = session;

        this._idGenerator = createIdGen();
    }

    sendChat(chat: Chat | string) {
        if (typeof chat === 'string') {
            chat = { type: KnownChatType.TEXT, text: chat } as Chat;
        }

        const data: DefaultReq = {
            'chatId': this._channel.channelId,
            'msgId': this._idGenerator.next().value,
            'msg': chat.text,
            'type': chat.type,
            'noSeen': true,
        };

        if (chat.attachment) {
            data['extra'] = chat.attachment;
        }

        return this._session.request('WRITE', data);
    }

    async forwardChat(chat: Chat) {
        const data: DefaultReq = {
            'chatId': this._channel.channelId,
            'msgId': this._idGenerator.next().value,
            'msg': chat.text,
            'type': chat.type,
            'noSeen': true,
        };

        if (chat.attachment) {
            data['extra'] = chat.attachment;
        }

        const status = (await this._session.request('FORWARD', data)).status;

        return { success: status === KnownDataStatusCode.SUCCESS, status };
    }

    async deleteChat(chat: ChatLogged) {
        const status = (await this._session.request(
            'DELETEMSG',
            {
                'chatId': this._channel.channelId,
                'logId': chat.logId
            }
        )).status;

        return {
            success: status === KnownDataStatusCode.SUCCESS,
            status
        };
    }
    
    async markRead(chat: ChatLogged) {
        const status = (await this._session.request(
            'NOTIREAD',
            {
                'chatId': this._channel.channelId,
                'watermark': chat.logId
            }
        )).status;
        return {
            success: status === KnownDataStatusCode.SUCCESS,
            status
        };
    }

    async getChannelInfo(): Promise<CommandResult<ChannelInfo>> {
        const res = (await this._session.request(
            'CHATINFO',
            {
                'chatId': this._channel.channelId,
            }
        ));

        // TODO: ChannelInfo

        return {
            success: res.status === KnownDataStatusCode.SUCCESS,
            status: res.status,
            result: { channelId: this._channel.channelId }
        };
    }

}

/**
 * Default OpenChannelSession implementation.
 */
export class TalkOpenChannelSession implements OpenChannelSession {

    private _channel: OpenChannel;
    private _session: CommandSession;

    constructor(channel: OpenChannel, session: CommandSession) {
        this._channel = channel;
        this._session = session;
    }
    
    async markRead(chat: ChatLogged) {
        const status = (await this._session.request(
            'NOTIREAD',
            {
                'chatId': this._channel.channelId,
                'li': this._channel.linkId,
                'watermark': chat.logId
            }
        )).status;

        return {
            success: status === KnownDataStatusCode.SUCCESS,
            status,
        };
    }

    getChannelInfo(): Promise<CommandResult<OpenChannelInfo>> {
        // TODO: OpenChannelInfo

        throw new Error("Method not implemented.");
    }

};

/**
 * Default ChannelManageSession implementation.
 */
export class TalkChannelManageSession implements ChannelManageSession {

    private _session: CommandSession;

    constructor(session: CommandSession) {
        this._session = session;
    }

    createChannel(template: ChannelTemplate) {
        const data: Record<string, any> = {
            'memberIds': template.userList.map(user => user.userId)
        };

        if (template.name) data['nickname'] = template.name;
        if (template.profileURL) data['profileImageUrl'] = template.profileURL;

        return this._session.request('CREATE', data);
    }

    createMemoChannel() {
        return this._session.request('CREATE', { 'memoChat': true });
    }

    async leaveChannel(channel: Channel, block: boolean = false): Promise<CommandResult<Long>> {
        const res = await this._session.request(
            'LEAVE',
            {
                'chatId': channel.channelId,
                'block': block
            }
        );

        return { status: res.status, success: res.status === KnownDataStatusCode.SUCCESS, result: res['lastTokenId'] };
    }

}