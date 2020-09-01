import * as BitcoinJS from 'bitcoinjs-lib';
import { transactionToPlain, transactionFromPlain, deriveAddressFromInput } from '../electrum-api';

const VECTORS = [{
    // a4453c9e224a0927f2909e49e3a97b31b5aa74a42d99de8cfcdaf293cb2ecbb7
    raw: "02000000025995e18973bdf55969c88f3d3d002b632c55d4c8e0634396b353b7f54b9f988f0b0000006b483045022100aaffb248cbc5ed60d39500bdbc314b561a6c3335925261ce80c7ff46292b6e85022031900d8615aab33ed05dcc0f00c20117953bf8b451b3c48e536529638bda93800121029774feb36d1af279b42a6414e9a702c5e451397671554792c00e5f14bcbce292ffffffff91e4507d8f23168babf755ab36cd746ead926909b71c03811293cbd18d7f3f92010000006a473044022015b8f78f4309065a7549de7491ab6fa88195507c06aa6e1b348b86a5a25c90e602201f8e867906186402f97ed1e595c0ccd9c0a9898c9905115be6c59912640c054c012103ce31b5e72db0c3a486487c12bd8c239d3e7f7c8bb6be1b3651766c43b6a1cecbffffffff01c0331602000000001976a914bfabbceedfbf9cc651a09148ba2de75b6008ba8988ac00000000",
    inputAddresses: [
        '1KuK7vSWJCKcidp6WU1Cj3csxKoeTiYYCs',
        '1eWLvbVNr5K7Qc5vxXqe8NVass3Wjc4wf',
    ],
}, {
    // 6f4e12fa9e869c8721f2d747e042ff80f51c6757277df1563b54d4e9c9454ba0
    raw: "02000000000103ea9915b1992cc4765def4079787feadf30ca928078b72fd847d0cf61bfac69ce0100000017160014f7f2031b649fc037bd324b22a2ad29c637c4f8a2ffffffff7ad3196446b22128db451eb4102a2d320d7020714fa7fc578d508295fe89f7640100000017160014d7de6960ba7b4a24567dea6670eee8f4012c86dbffffffff86ea1d5c053c6986fb070a3ba6bf01a4cb39c341789c2f19a84ecbb7b4cf6df501000000171600144b9915c419aa7971cfbe269adebd4293cd8cc48fffffffff02f57904000000000017a91456422444f1c70154c1c15dafde8558f079a2b1ab87b77701000000000017a914a9e6b2a495a391d227385b240492422edb11e4f98702473044022015ef5b1a6fc66d98ffc4e234b1922f0bc2c1f422e3a7fe7dd9df0088152f62a002200a95ae8d7a2b4350fb6d78e97c514b88aec651b48d5e01ad8cc9a917401756c4012102e9cc7021931b4fdad36f973aec807c5907aea901ad29d2537a46237d85c8bf340247304402200ec38966ea3d611b57c309bae75a5d9fecc312a102e8b5dcdbfc773ecd770fc50220662be12436ace6133a61614e5edd011ef53ffdcc0d5aa5a38ec2f5356454711201210378d55dc8b86a0f40a13ea76e0f28b61b2db6bee8ab517e49d8f9e2d147912e3b0246304302207d6ad588e4ad5cfa97c7eec563114523b9a696c6aba3b55f1f17ddce3f132473021f13b71903f304a81bf72b515bacf9bd1bf3ee8d5c0393ecc902aa3fca3c27e80121037aff60849444cc1c9dd6736e23300644373e08d4f712eb45e8238a8f9176a75b00000000",
    inputAddresses: [
        '3AuTNAGZhSdLWMk2UWvCQ2MrTxBvkddfXd',
        '32ddG8rNGLkj9fSj1ULhJPyqXja8mTqapv',
        '3E2ub7ncCgwxCCUHV3svDmSQpmDA6pDGVG',
    ],
}, {
    // 3c89e220db701fed2813e0af033610044bc508d2de50cb4c420b8f3ad2d72c5c
    raw: "010000000001015b23f24c2d745f30de9bb2fad493590bec970fe2dfb16055e72ece3aeab4ed7e1b00000000ffffffff2090ac0400000000001976a914dfe6c4ed80fcbf132110bce8846da1441368182388acadb7dc01000000001976a914e262b919bf8261c5977db97bb5033ddb075087fb88ac8d5605000000000017a914873c939ee3cdcbdd8e24eb28e95e7bab3cc9120f87b741da010000000017a914df1dcd7b2a8a2def75406689c62fb85af067996f87887e66000000000017a914452cfe91f96a00030c610d65698a7fe5f240d1d5871a7a010000000000160014e64280d06869af9c2b9fe3482f4e79b77e405788cb8809000000000017a914d6ee0ba12db8585ce9016339c0c60a36c29299b287f1791e000000000016001422893df86302d904561ec75c7fee366d49143f98ae5e04000000000017a914da494c677be71a5483af6d9b67e82980d0a45e1b87cedf02000000000017a9141fad92ca1f0cee38c2cb1b5a248b6f23cede054287a56c2300000000001976a91411010da4e967fa9bd8d7b3b9584456ed6b8edf8488ac2b4d720000000000160014dc111e0d431cce9bab573fa7f5d01c2ebfdbfe003e9b00000000000017a914d6d40625e20e11dbda107b71bf7bfc53878a3077873dc000000000000017a914f5af921607c1d6cc4d2b247c4c5e9bc2ed92d29187f3b61300000000001976a914ba46ecc8f90b89fff81e8b46329e321d9fa5319288acd3f107000000000017a914accbb8f5871b1f5b1eaeeee5a4b6c0c24a04664087b70c2100000000001976a914eb4c264dd25f18e146909b640cc9437fac41bd6388acfb610200000000001976a914beffad55f26d1b6e24ef18b0926ceebbb3fd7b9888ac5b1d0b000000000017a914a28c58125dd894d44b151e7722cebfb0f2a6ae2e879ee760000000000017a91424c1aaf94d5542101d949f734d611b4d037d79c18766d71c00000000001976a9141015930bfd6d9ac8ab8ccbc772e87a86a24000a588ac09912000000000001976a914511c17369a01487d6e39c29a17e6156f26da3e4988ac53e707000000000017a914f29c0e0259279636e67be0de557c9a9b7ee48d468747240f00000000001976a9148f2bbe49f7329c1eeed8af867125304703016b6e88ac55330e000000000017a914d58997a805e5a942520b1a22e33917ac2c44f67587a2450900000000001976a914023a083571f728938bbc46c2c56d4afd40f71cb588ac93710c000000000017a9143b76158343235d02310f490a784317d620a29bc2870c680000000000001976a914c110ba7b6d4b079c8c74d0c752eeeca85754687e88ac66140b00000000001976a9142d3d3a890a37ba19eddd8330bcab6ed573811c5d88ac03cb0800000000001976a9142f03281093e7205e9e843890913e931287a4680488ac1d450100000000001976a914cf2c824e339ef74a97a7341cf48b5f1e31da036888ac285e0b000000000017a9149b6319ab598ccfe4c9d01e1a73a48aec06b962048702473044022067808457613445b696b82c2a5522314fc2ba83d011cb0cb07d6cde2432db8e57022044af6bccfd4b007ec5521ef7e6fef9fc7e84685fe5a2741f3410b93e30c88506012102f546b0ae6a1e1ccbf20f13d10e993e499fbba8982be5fbc8a8909a49b41f3f4500000000",
    inputAddresses: [
        'bc1qd3yhldxmtj3u9a0xv0cgm3nt028w3cr0xjvk6s',
    ],
}, {
    // 80975cddebaa93aa21a6477c0d050685d6820fa1068a2731db0f39b535cbd369
    raw: "010000000001045ecd4aef9b6e0d86310203ae0925f2562420c151bcd41b7464f05eed6c26a10862000000fc0047304402207e3e1158831eca394e472e43ec2a4c9f10d034a83f0f7142e6c38c243e6074f9022000b10a29bccf3c31f61e047a400d1a8d620cf8be7fb39ea5c51c6aeac83e7e6b0147304402205bc85c03a0f786bdf6a985911cf27d94d6f4c0f00295236a304967564cca492a022011e0d80900998f601290223240ed21d13dcce11b1d045383361978ac02e27c97014c69522102194e1b5671daff4edc82ce01589e7179a874f63d6e5157fa0def116acd2c3a522103a043861e123bc67ddcfcd887b167e7ff9d00702d1466524157cf3b28c7aca71b2102a49a62a9470a31ee51824f0ee859b0534a4f555c0e2d7a9d9915d6986bfc200453aeffffffff0b5c10d858331e2c60061b8c178c7a9cea7d668db500d16fceeed5b808854cad7d000000fc0047304402203299b925b1f2c87282d2889c2bb0e07372f916d7c4781f43f2e6d1403b2425fe0220466d075c56cdcf1d659dd40edcfc68298826f935beabe12f7404c7fd1e496c8601473044022048dfe509326808f9367c88da0f14968121d31b45461a11e6ed640e72f6a53a300220517914666f2f0f1d2c306de49599bf0a95f59cd57eaaef49e44a4e48a8d9e139014c69522103b5fd9803c0046386a9c7a1ac80c102ac4bc1e6dfaec036b0ca3adebe1ca961c92102b8b42d1c84d778c4fa78c609611a9cb847c3d7bff231e5751f380503c583d36321030d2c5aee1d650c2a3150e1c66a1f1e7236ecabdc12e55b0f545fff14667a515f53aeffffffffb229063113b096fe69c1c0bdb07c35655240ebf789bd25f202b58483796b06c8a3000000fdfd000047304402204d4da5303be178d649cfab85f4d6777c365934f015b773f2269e2cc4a819eaae02207f79285ddc34c6def51df243a5abc5f36179f407172bcae88feb04da1ab1b00001483045022100b831d970bc3ea88bc6b717bbd1ad8aca9bcc8e6545988ee9718db75891db2e1702200d6bf7c4b91abcc32a610cf52112e550ae853b2f216b88803b560f5adc0d9742014c69522102c44af6aea46b1b7a9373078437ecdf993b701efd2cc297414d8eab5063887dce2103546047f27105c7db32ebe5f3f8655856d2c27ecff80614b36da6e3cf84e88d8321022fa39834a8308abba605b1b2315b508a3268b5a43bc43d60c844f65db8fb78ad53aeffffffff1dd2d6d772ca3ea10e22347e19dd47f4019909ab471c8a8cdab29e0d2df00fd89a0000002322002044c55c1da36a576217259c3bc21b0c3943f7eb3ff4e3c381d9fd3502434b9e87ffffffff05c0d401000000000017a914a1932cfd432d928311b4ada550bbc468d1e909b787a08601000000000017a9146b0e7a66416f1d8598b5956576adb22daf79853e873a4a00000000000017a914ec4c73145428abbe0b1c40fbf58c59f0ef3c29f487382c05000000000017a914abb18a298e5b629bf5652f341d2cd8207ccc214a8780100200000000001976a91438d769cf2899983022b5611ab4d35bf7907dae2088ac000000040047304402202c3f94e5daf4057377d9f16d45b57e962de42fb42cb7e95a0382b7c66624980a02204098f6acd43b0391ea1b4a8102797e78895848fb7e883f98d207d14d45945a69014730440220448460edd5291a548c571ccf3a72caf47b02364035dc84f420d311e3a0c5494802205bb1cc89f20dc1e2c1f6eadb74898f8eecc46fbf488b676636b45fafaeb96e0f01695221021e6617e06bb90f621c3800e8c37ab081a445ae5527f6c5f68a022e7133f9b5fe2103bea1a8ce6369435bb74ff1584a136a7efeebfe4bc320b4d59113c92acd869f38210280631b27700baf7d472483fadfe1c4a7340a458f28bf6bae5d3234312d684c6553ae00000000",
    inputAddresses: [
        '3JUJgXbB1WpDEJprE8wP8vEXtba36dAYbk',
        '3Hzfqs3XUxKJaKoLWWjLubha65XmjMR4fw',
        '3JGQKc98gKT82VSSdRRD4WFUWj6HSAtBCH',
        '3CYkk3x1XUvdXCdHtRFdjMjp17PuJ8eR8z',
    ],
}, {
    // 54a3e33efff4c508fa5c8ce7ccf4b08538a8fd2bf808b97ae51c21cf83df2dd1
    raw: "01000000000101c35f4260841961ccf8404100dbbc5d0423664715e18a2b2b8ab7efb0c9a64c930200000000ffffffff04a08601000000000017a914939debd18a4a4d7a0d5bb12b6544893cbfdd057787004495080000000017a91410d68452cac4e8924a9a0a0692e2a24a06e789078780848f02000000001976a9142aef21570bdbaa25170d5297001cd0e3e458899388ac8ef9a40400000000220020701a8d401c84fb13e6baf169d59684e17abd9fa216c8cc5b9fc63d622ff8c58d0400473044022049fca5a898ce119bfa266557d63b7c7d6cd8f92d45a9e350177287556ffd90210220361e67d1a7c130e3ca3106a9f6aef3a53cf5aa19afa6c74454b308516f59eb490147304402202a26ecacf5602b5eece52a2db498b87d4d5ac487208d8f86a691a6ef35f88d0302206454e8b376f4801a8a7a8677af4ecaddfe0b2bffa67b3c77931a3b660859f123016952210375e00eb72e29da82b89367947f29ef34afb75e8654f6ea368e0acdfd92976b7c2103a1b26313f430c4b15bb1fdce663207659d8cac749a0e53d70eff01874496feff2103c96d495bfdd5ba4145e3e046fee45e84a8a48ad05bd8dbb395c011a32cf9f88053ae00000000",
    inputAddresses: [
        'bc1qwqdg6squsna38e46795at95yu9atm8azzmyvckulcc7kytlcckxswvvzej',
    ],
}, {
    // da632d44bc7db5ca31f54223800cdeb9291f496bece7e25be3f7da6c7b9f3f3a (coinbase transaction)
    raw: "020000000001010000000000000000000000000000000000000000000000000000000000000000ffffffff4c03a1d909045d83475f687a2f42696e616e63652ffabe6d6d85becf72c18438821e00d35f6f7a547a987eb8dd10cc37169f93853b0f0ac013020000008df9e483021513ac7fad415f7c5e7900ffffffff030112ee2b000000001976a914887d65fdc11cd8151c92530f323aada252792dc888ac0000000000000000266a24aa21a9ed67188937218d3458585e48bc568780bd58f6db5cd7a3fef55b90b7fb4c0d9e640000000000000000266a24b9e11b6d7e94baaa447c4b4262caece3c7bdc2c34636f2b8cd8e14a230b57571ade446b70120000000000000000000000000000000000000000000000000000000000000000000000000",
    inputAddresses: [
        undefined,
    ],
}, {
    // 5800c704f139e388d4146be7110294470c8c17b34488544863a535d2346a4637
    raw: "0200000000010124e06fe5594b941d06c7385dc7307ec694a41f7d307423121855ee17e47e06ad0100000000ffffffff0137aa0b000000000017a914050377baa6e8c5a07aed125d0ef262c6d5b67a038705483045022100d780139514f39ed943179e4638a519101bae875ec1220b226002bcbcb147830b0220273d1efb1514a77ee3dd4adee0e896b7e76be56c6d8e73470ae9bd91c91d700c01210344f8f459494f74ebb87464de9b74cdba3709692df4661159857988966f94262f20ec9e9fb3c669b2354ea026ab3da82968a2e7ab9398d5cbed4e78e47246f2423e01015b63a82091d6a24697ed31932537ae598d3de3131e1fcd0641b9ac4be7afcb376386d71e8876a9149f4a0cf348b478336cb1d87ea4c8313a7ca3de1967029000b27576a91465252e57f727a27f32c77098e14d88d8dbec01816888ac00000000",
    inputAddresses: [
        'bc1q9szt96cq4vulpqu5m96sspcu0mt3rvv0qmwl5rxvyxejlw08zp7qnnyg3c',
    ],
}, {
    // Example from https://bitcoin.stackexchange.com/a/74953
    raw: "02000000016bf1cd008e8de34a8e3c26196d13b8df9fcb37adf9053f3c0793c43b1664876a00000000440E426974636f696e5f72756c657321513363a9148103b0df9ad75e2b774f43d6e7e71eeaa2c73efb876776a9146a81e587585e58b07dce293a089894a0f8a61b8488ac68ffffffff0178b69a3b000000001976a9148f4b44f4975751d7cf6a797e0818c353afbd3bb388ac00000000",
    inputAddresses: [
        '2MxBFEWKRPBy96BCxmuZuXkz5CfivDg8e1a',
    ],
    network: BitcoinJS.networks.regtest,
}];

describe('ElectrumApi', () => {
    it('can convert to and from PlainTransaction', () => {
        for (const vector of VECTORS) {
            const tx = BitcoinJS.Transaction.fromHex(vector.raw);

            const plain = transactionToPlain(tx);
            const revived = transactionFromPlain(plain);

            expect(revived.getId()).toEqual(tx.getId());
        }
    });

    fit('can decode input addresses', () => {
        for (const vector of VECTORS) {
            const tx = BitcoinJS.Transaction.fromHex(vector.raw);

            const addresses = tx.ins.map(input => deriveAddressFromInput(input, vector.network));

            expect(addresses).toEqual(vector.inputAddresses);
        }
    })
});
